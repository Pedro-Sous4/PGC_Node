/* eslint-disable no-console */
const { PrismaClient, ProcessingStatus } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function statusPriority(status) {
  switch (status) {
    case ProcessingStatus.ERROR:
      return 4;
    case ProcessingStatus.PROCESSING:
      return 3;
    case ProcessingStatus.SUCCESS:
      return 2;
    case ProcessingStatus.PENDING:
      return 1;
    default:
      return 0;
  }
}

function chooseStatus(a, b) {
  return statusPriority(a) >= statusPriority(b) ? a : b;
}

function looksLikeTitleCase(value) {
  const v = String(value ?? '').trim();
  if (!v) return false;
  return v !== v.toLowerCase();
}

async function loadRelationCountsByCredorId() {
  const [rendimentos, historicos, emailLogs, statuses] = await Promise.all([
    prisma.rendimento.groupBy({ by: ['credorId'], _count: { _all: true } }),
    prisma.historicoPGC.groupBy({ by: ['credorId'], _count: { _all: true } }),
    prisma.emailLog.groupBy({ by: ['credorId'], _count: { _all: true } }),
    prisma.credorProcessingStatus.groupBy({ by: ['credorId'], _count: { _all: true } }),
  ]);

  const counts = new Map();
  const apply = (rows) => {
    for (const row of rows) {
      if (!row.credorId) continue;
      counts.set(row.credorId, (counts.get(row.credorId) ?? 0) + Number(row._count?._all ?? 0));
    }
  };

  apply(rendimentos);
  apply(historicos);
  apply(emailLogs);
  apply(statuses);

  return counts;
}

function pickKeeper(items, relationCounts) {
  const scored = [...items].sort((a, b) => {
    const relatedA = relationCounts.get(a.id) ?? 0;
    const relatedB = relationCounts.get(b.id) ?? 0;
    if (relatedA !== relatedB) return relatedB - relatedA;

    const infoA = Number(Boolean(a.email)) + Number(Boolean(a.grupoId)) + Number(Boolean(a.enviado));
    const infoB = Number(Boolean(b.email)) + Number(Boolean(b.grupoId)) + Number(Boolean(b.enviado));
    if (infoA !== infoB) return infoB - infoA;

    const titleA = Number(looksLikeTitleCase(a.nomeExibivel));
    const titleB = Number(looksLikeTitleCase(b.nomeExibivel));
    if (titleA !== titleB) return titleB - titleA;

    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    if (dateA !== dateB) return dateA - dateB;

    return a.id.localeCompare(b.id);
  });

  return scored[0];
}

async function mergeProcessingStatuses(duplicateCredorId, keeperCredorId) {
  const duplicateStatuses = await prisma.credorProcessingStatus.findMany({
    where: { credorId: duplicateCredorId },
    select: {
      id: true,
      processingJobId: true,
      stage: true,
      status: true,
      warning: true,
      errorMessage: true,
    },
  });

  for (const row of duplicateStatuses) {
    const target = await prisma.credorProcessingStatus.findFirst({
      where: {
        processingJobId: row.processingJobId,
        credorId: keeperCredorId,
        stage: row.stage,
      },
      select: {
        id: true,
        status: true,
        warning: true,
        errorMessage: true,
      },
    });

    if (!target) {
      await prisma.credorProcessingStatus.update({
        where: { id: row.id },
        data: { credorId: keeperCredorId },
      });
      continue;
    }

    const mergedStatus = chooseStatus(target.status, row.status);
    const mergedWarning = target.warning || row.warning || null;
    const mergedErrorMessage = target.errorMessage || row.errorMessage || null;

    await prisma.credorProcessingStatus.update({
      where: { id: target.id },
      data: {
        status: mergedStatus,
        warning: mergedWarning,
        errorMessage: mergedErrorMessage,
      },
    });

    await prisma.credorProcessingStatus.delete({ where: { id: row.id } });
  }
}

async function mergeCredor(duplicate, keeper) {
  await prisma.rendimento.updateMany({
    where: { credorId: duplicate.id },
    data: { credorId: keeper.id },
  });

  await prisma.historicoPGC.updateMany({
    where: { credorId: duplicate.id },
    data: { credorId: keeper.id },
  });

  await prisma.emailLog.updateMany({
    where: { credorId: duplicate.id },
    data: { credorId: keeper.id },
  });

  await mergeProcessingStatuses(duplicate.id, keeper.id);

  await prisma.credor.delete({ where: { id: duplicate.id } });
}

async function run() {
  const dryRun = !process.argv.includes('--apply');
  const credores = await prisma.credor.findMany({
    select: {
      id: true,
      slug: true,
      nomeExibivel: true,
      nomeCanonico: true,
      email: true,
      grupoId: true,
      enviado: true,
      created_at: true,
    },
  });

  const groups = new Map();
  for (const credor of credores) {
    const key = normalizeName(credor.nomeCanonico || credor.nomeExibivel);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(credor);
  }

  const duplicates = [...groups.entries()].filter(([, list]) => list.length > 1);
  console.log(`[dedupe] grupos duplicados: ${duplicates.length}`);

  if (duplicates.length === 0) {
    return;
  }

  const relationCounts = await loadRelationCountsByCredorId();
  let removed = 0;

  for (const [key, list] of duplicates) {
    const keeper = pickKeeper(list, relationCounts);
    const rest = list.filter((item) => item.id !== keeper.id);

    console.log(`\n[grupo] ${key}`);
    console.log(`  manter: ${keeper.nomeExibivel} (${keeper.id}) slug=${keeper.slug}`);
    for (const dup of rest) {
      console.log(`  remover: ${dup.nomeExibivel} (${dup.id}) slug=${dup.slug}`);
    }

    if (dryRun) continue;

    await prisma.$transaction(async () => {
      for (const dup of rest) {
        await mergeCredor(dup, keeper);
        removed += 1;
      }
    });
  }

  if (dryRun) {
    console.log('\n[dedupe] dry-run concluido. Rode com --apply para executar.');
  } else {
    console.log(`\n[dedupe] concluido. duplicatas removidas: ${removed}`);
  }
}

run()
  .catch((error) => {
    console.error('[dedupe] falha:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

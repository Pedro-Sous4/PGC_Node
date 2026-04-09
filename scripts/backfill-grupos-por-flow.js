const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function ensureGrupo(nome) {
  const existing = await prisma.grupo.findFirst({
    where: { nome: { equals: nome, mode: 'insensitive' } },
    select: { id: true, nome: true },
  });
  if (existing) return existing;
  return prisma.grupo.create({ data: { nome }, select: { id: true, nome: true } });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const workspaceRoot = process.cwd();
  const sportsArtifactsDir = path.join(workspaceRoot, 'apps', 'api', 'artifacts', 'sports');

  const sportsRequestIds = new Set();
  if (fs.existsSync(sportsArtifactsDir)) {
    for (const entry of fs.readdirSync(sportsArtifactsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) sportsRequestIds.add(entry.name);
    }
  }

  const [grupoSports, grupoLgm, credores, jobs] = await Promise.all([
    ensureGrupo('SPORTS'),
    ensureGrupo('LGM'),
    prisma.credor.findMany({
      select: {
        id: true,
        slug: true,
        nomeExibivel: true,
        grupoId: true,
        grupo: { select: { nome: true } },
        historicos: { select: { requestId: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 20 },
      },
    }),
    prisma.processingJob.findMany({
      where: { source: { in: ['laghetto-sports', 'lgm'] } },
      select: {
        requestId: true,
        source: true,
        updated_at: true,
        credores: { select: { credorId: true, updated_at: true } },
      },
      orderBy: { updated_at: 'desc' },
      take: 5000,
    }),
  ]);

  const latestFlowByCredor = new Map();
  for (const job of jobs) {
    const source = job.source === 'laghetto-sports' ? 'SPORTS' : job.source === 'lgm' ? 'LGM' : null;
    if (!source) continue;
    for (const st of job.credores) {
      const prev = latestFlowByCredor.get(st.credorId);
      const ts = new Date(st.updated_at || job.updated_at).getTime();
      if (!prev || ts > prev.ts) latestFlowByCredor.set(st.credorId, { flow: source, ts });
    }
  }

  const updates = [];
  let byFlowJob = 0;
  let bySportsArtifact = 0;

  for (const credor of credores) {
    const currentGroup = norm(credor.grupo?.nome);
    let target = null;

    const byJob = latestFlowByCredor.get(credor.id);
    if (byJob) {
      target = byJob.flow;
      byFlowJob += 1;
    }

    if (!target) {
      const hasSportsRequest = credor.historicos.some((h) => sportsRequestIds.has(h.requestId));
      if (hasSportsRequest) {
        target = 'SPORTS';
        bySportsArtifact += 1;
      }
    }

    if (!target) continue;

    const targetGroupId = target === 'SPORTS' ? grupoSports.id : grupoLgm.id;
    const targetGroupName = target === 'SPORTS' ? 'sports' : 'lgm';

    if (credor.grupoId === targetGroupId || currentGroup === targetGroupName) continue;

    updates.push({
      id: credor.id,
      nome: credor.nomeExibivel,
      slug: credor.slug,
      from: credor.grupo?.nome || '(sem grupo)',
      to: target,
      targetGroupId,
    });
  }

  console.log(`CREDORES_TOTAL=${credores.length}`);
  console.log(`SPORTS_REQUEST_IDS=${sportsRequestIds.size}`);
  console.log(`INFERIDOS_POR_JOB=${byFlowJob}`);
  console.log(`INFERIDOS_POR_ARTIFACT_SPORTS=${bySportsArtifact}`);
  console.log(`ATUALIZACOES_PLANEJADAS=${updates.length}`);

  if (!apply) {
    for (const row of updates.slice(0, 20)) {
      console.log(`DRYRUN ${row.nome} | ${row.from} -> ${row.to}`);
    }
    if (updates.length > 20) {
      console.log(`DRYRUN ... +${updates.length - 20} registros`);
    }
    console.log('MODO=DRYRUN (use --apply para aplicar)');
    return;
  }

  let changed = 0;
  for (const row of updates) {
    await prisma.credor.update({
      where: { id: row.id },
      data: { grupoId: row.targetGroupId },
    });
    changed += 1;
  }

  const finalRows = await prisma.credor.findMany({
    select: { grupo: { select: { nome: true } } },
  });

  const countSports = finalRows.filter((r) => norm(r.grupo?.nome) === 'sports').length;
  const countLgm = finalRows.filter((r) => norm(r.grupo?.nome) === 'lgm').length;
  const countSem = finalRows.filter((r) => !r.grupo?.nome).length;
  const countOutros = finalRows.filter((r) => {
    const g = norm(r.grupo?.nome);
    return g && g !== 'sports' && g !== 'lgm';
  }).length;

  console.log(`APLICADO=${changed}`);
  console.log(`FINAL_SPORTS=${countSports}`);
  console.log(`FINAL_LGM=${countLgm}`);
  console.log(`FINAL_SEM_GRUPO=${countSem}`);
  console.log(`FINAL_OUTROS=${countOutros}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

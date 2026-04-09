const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function putJson(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PUT ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function writeFixtures(pgcCode) {
  const apiArtifacts = path.join(process.cwd(), 'apps', 'api', 'artifacts');
  const pgcDir = path.join(apiArtifacts, `pgc-${pgcCode}`);
  fs.mkdirSync(pgcDir, { recursive: true });

  const minimoPath = path.join(pgcDir, 'MINIMO.xlsx');
  const descontosPath = path.join(pgcDir, 'DESCONTOS.xlsx');
  const empPath = path.join(pgcDir, 'EMPRESAS_NOMECURTO_CNPJ.xlsx');

  const wb1 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb1,
    XLSX.utils.json_to_sheet([
      { CREDOR: 'Maria da Silva', 'MINIMO/FIXO': 'R$ 500,00', 'EMPRESA EMISSAO': 'EMP_TESTE', CNPJ: '' },
    ]),
    'MINIMO',
  );
  XLSX.writeFile(wb1, minimoPath);

  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb2,
    XLSX.utils.json_to_sheet([
      { CREDOR: 'Maria da Silva', DESCRICAO: 'ADIANTAMENTO', VALOR: 'R$ 120,00' },
      { CREDOR: 'Maria da Silva', DESCRICAO: 'AJUSTE', VALOR: 'R$ 15,40' },
    ]),
    'DESCONTOS',
  );
  XLSX.writeFile(wb2, descontosPath);

  const wb3 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb3,
    XLSX.utils.json_to_sheet([{ nome_curto: 'EMP_TESTE', cnpj: '12.345.678/0001-99' }]),
    'MAPA',
  );
  XLSX.writeFile(wb3, empPath);
}

async function main() {
  const pgcCode = 'PGC-DINAMICO-04';
  writeFixtures(pgcCode);

  const suffix = Date.now();
  const grupo = await postJson('http://localhost:3001/grupos', { nome: `GRUPO_EMAIL_DINAMICO_${suffix}` });

  const credor = await postJson('http://localhost:3001/credores', {
    nome: 'Maria da Silva',
    email: `maria.dinamico.${suffix}@example.com`,
    grupoId: grupo.id,
  });

  await postJson('http://localhost:3001/rendimentos', {
    credorId: credor.id,
    numero_pgc: pgcCode,
    referencia: '2026-03',
    valor: 'R$ 1000,00',
  });

  const hist = await getJson(`http://localhost:3001/historico-pgc?credorId=${credor.id}`);
  if (Array.isArray(hist) && hist[0]?.id) {
    await putJson(`http://localhost:3001/historico-pgc/${hist[0].id}`, {
      numero_pgc: pgcCode,
      periodo: '2026-03',
    });
  }

  const send = await postJson('http://localhost:3001/emails/enviar', {
    grupoId: grupo.id,
    numero_pgc: pgcCode,
    escopo: 'todos',
  });

  const detail = Array.isArray(send.details) ? send.details[0] : undefined;
  console.log(
    JSON.stringify(
      {
        sent: send.sent,
        failed: send.failed,
        info_minimo: detail?.info_minimo ?? null,
        info_descontos: detail?.info_descontos ?? null,
        mensagem: detail?.mensagem ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

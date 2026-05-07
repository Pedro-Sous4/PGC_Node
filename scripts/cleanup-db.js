
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando limpeza profunda do banco de dados (JS)...');

  // Tabelas para limpar (ordem dependente de chaves estrangeiras)
  const tables = [
    'emailLog',
    'historicoPGC',
    'rendimento',
    'saldoDevedor',
    'eventoFinanceiro',
    'historicoMinimo',
    'credorProcessingStatus',
    'processingError',
    'processingStep',
    'processingArtifact',
    'reprocessItem',
    'reprocessJob',
    'processingJob',
    'configuracaoLayout',
    'credor',
    'grupo',
    'empresaPagadora',
    'passwordResetToken'
  ];

  for (const table of tables) {
    try {
      const count = await prisma[table].deleteMany({});
      console.log(`✅ Tabela ${table}: ${count.count} registros removidos.`);
    } catch (error) {
      console.error(`❌ Erro ao limpar tabela ${table}:`, error.message);
    }
  }

  const gruposCount = await prisma.grupo.count();
  const empresasCount = await prisma.empresaPagadora.count();
  const usuariosCount = await prisma.appUser.count();

  console.log('\n--- Status Atual (Preservado) ---');
  console.log(`📂 Grupos: ${gruposCount}`);
  console.log(`🏢 Empresas Pagadoras: ${empresasCount}`);
  console.log(`👤 Usuários: ${usuariosCount}`);
  console.log('---------------------------------\n');

  console.log('✨ Limpeza concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error('💥 Falha crítica no script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

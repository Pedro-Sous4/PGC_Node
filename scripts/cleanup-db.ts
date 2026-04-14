
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando limpeza profunda do banco de dados...');

  // Ordem reversa de dependência
  const tables = [
    'EmailLog',
    'HistoricoPGC',
    'Rendimento',
    'CredorProcessingStatus',
    'ProcessingError',
    'ProcessingStep',
    'ProcessingArtifact',
    'ReprocessItem',
    'ReprocessJob',
    'ProcessingJob',
    'Credor',
  ];

  for (const table of tables) {
    try {
      const { count } = await (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)].deleteMany({});
      console.log(`✅ Tabela ${table}: ${count} registros removidos.`);
    } catch (error) {
      console.error(`❌ Erro ao limpar tabela ${table}:`, (error as Error).message);
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


import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
});

async function main() {
  console.log('🚀 Iniciando limpeza profunda do sistema (Estado Virgem)...');

  // 1. Limpeza do Redis
  try {
    console.log('🧹 Limpando Redis (Jobs e Cache)...');
    await redis.flushall();
    console.log('✅ Redis limpo com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao limpar Redis:', (error as Error).message);
  } finally {
    await redis.quit();
  }

  // 2. Limpeza do Banco de Dados (Ordem reversa de dependência)
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
    'SaldoDevedor',
    'EventoFinanceiro',
    'Credor',
    // Mantendo 'Grupo' pois pode ser considerado dado de configuração inicial
  ];

  for (const table of tables) {
    try {
      const modelName = table.charAt(0).toLowerCase() + table.slice(1);
      const { count } = await (prisma as any)[modelName].deleteMany({});
      console.log(`✅ Tabela ${table}: ${count} registros removidos.`);
    } catch (error) {
      console.error(`❌ Erro ao limpar tabela ${table}:`, (error as Error).message);
    }
  }

  // 3. Status Final
  const gruposCount = await prisma.grupo.count();
  const empresasCount = await prisma.empresaPagadora.count();
  const usuariosCount = await prisma.appUser.count();
  const layoutCount = await prisma.configuracaoLayout.count();

  console.log('\n--- Status Atual (Preservado) ---');
  console.log(`📂 Grupos: ${gruposCount}`);
  console.log(`🏢 Empresas Pagadoras: ${empresasCount}`);
  console.log(`👤 Usuários: ${usuariosCount}`);
  console.log(`🎨 Configurações de Layout: ${layoutCount}`);
  console.log('---------------------------------\n');

  console.log('✨ Sistema resetado para estado virgem com sucesso!');
}

main()
  .catch((e) => {
    console.error('💥 Falha crítica no script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

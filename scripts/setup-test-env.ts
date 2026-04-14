import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- INICIANDO LIMPEZA DE DADOS ---');

  // Ordem de deleção respeitando FKs
  const tables = [
    'EmailLog',
    'ProcessingArtifact',
    'CredorProcessingStatus',
    'ProcessingStep',
    'ProcessingError',
    'ProcessingJob',
    'ReprocessItem',
    'ReprocessJob',
    'Rendimento',
    'HistoricoPGC',
    'Credor',
    'Grupo',
    'AppUser',
  ];

  for (const table of tables) {
    try {
      await (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)].deleteMany({});
      console.log(`[OK] Tabela ${table} limpa.`);
    } catch (err) {
      console.error(`[ERRO] Falha ao limpar ${table}:`, (err as Error).message);
    }
  }

  console.log('\n--- CADASTRANDO CREDORES DE TESTE ---');

  const group = await prisma.grupo.create({
    data: { nome: 'TESTE_SISTEMA' },
  });

  const testEmail = 'pedroforoni@gmail.com';

  for (let i = 1; i <= 5; i++) {
    const name = `Credor Teste ${String(i).padStart(2, '0')}`;
    const slug = `credor-teste-${String(i).padStart(2, '0')}`;
    
    await prisma.credor.create({
      data: {
        nomeExibivel: name,
        nomeCanonico: name.toUpperCase(),
        slug: slug,
        email: testEmail,
        grupoId: group.id,
      },
    });
    console.log(`[OK] ${name} criado com e-mail: ${testEmail}`);
  }

  console.log('\n--- SETUP CONCLUÍDO COM SUCESSO ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import * as path from 'path';

// This is a simplified version of the logic in emails.service.ts
// to verify that the DB value is picked up correctly.

async function verify() {
  const prisma = new PrismaClient();
  const credorNome = 'Ludmilla Rosa Moreira De Souza';
  const numeroPgc = '37';

  console.log(`Verificando para: ${credorNome} (PGC ${numeroPgc})`);

  try {
    const rendimento = await prisma.rendimento.findFirst({
        where: {
          numero_pgc: numeroPgc,
          credor: {
            OR: [
              { nomeExibivel: { contains: credorNome, mode: 'insensitive' } },
              { nomeCanonico: { contains: credorNome, mode: 'insensitive' } }
            ]
          }
        }
      });

    if (rendimento) {
      console.log('--- ENCONTRADO NO DB ---');
      console.log(`ID: ${rendimento.id}`);
      console.log(`Valor (Raw): ${rendimento.valor}`);
      
      const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(rendimento.valor));
      console.log(`Valor Formatado: ${valorFormatado}`);
      
      if (Number(rendimento.valor) === 693.60) {
        console.log('\n[SUCESSO] O valor no Banco de Dados é o correto (693.60).');
      } else {
        console.warn(`\n[AVISO] O valor no Banco de Dados (${rendimento.valor}) não é o esperado (693.60).`);
      }
    } else {
      console.error('\n[ERRO] Registro de rendimento não encontrado no DB.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

verify();

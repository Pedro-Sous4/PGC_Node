import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

function normalizeText(value: any): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripCredorLeadingCode(value: any): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSlug(value: any): string {
  return normalizeText(stripCredorLeadingCode(value)).replace(/\s+/g, '-');
}

async function run() {
  const numeroPgc = '37';
  
  // 1. Detect current reference for the PGC
  const sampleRendimento = await prisma.rendimento.findFirst({
    where: { numero_pgc: numeroPgc }
  });
  
  const reference = sampleRendimento?.referencia || 'junho,2025';
  console.log(`Utilizando referência: ${reference}`);

  // 2. Read Excel
  const filePath = 'C:\\PGC_Node\\minimo.xlsx';
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`Processando ${data.length - 1} linhas do Excel...`);

  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  // Skip header
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const excelName = row[0];
    const valorMinimo = parseFloat(String(row[8] || '0'));

    if (!excelName || isNaN(valorMinimo)) {
        skippedCount++;
        continue;
    }

    const slug = toSlug(excelName);
    const credor = await prisma.credor.findUnique({ where: { slug } });

    if (!credor) {
      console.warn(`[AVISO] Credor não encontrado: ${excelName} (${slug})`);
      skippedCount++;
      continue;
    }

    // Check if record already exists for this PGC/Credor
    const existing = await prisma.rendimento.findFirst({
      where: {
        credorId: credor.id,
        numero_pgc: numeroPgc
      }
    });

    if (existing) {
      await prisma.rendimento.update({
        where: { id: existing.id },
        data: {
          valor: valorMinimo,
          referencia: reference, // Ensure consistency
          updated_at: new Date(),
          source: 'reconciliation-xlsx'
        }
      });
      updatedCount++;
    } else {
      await prisma.rendimento.create({
        data: {
          credorId: credor.id,
          numero_pgc: numeroPgc,
          referencia: reference,
          valor: valorMinimo,
          source: 'reconciliation-xlsx'
        }
      });
      createdCount++;
    }
  }

  console.log('\n--- RESULTADO DA OPERAÇÃO ---');
  console.log(`- Atualizados: ${updatedCount}`);
  console.log(`- Criados: ${createdCount}`);
  console.log(`- Pulados: ${skippedCount}`);
  console.log('-----------------------------');

  await prisma.$disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

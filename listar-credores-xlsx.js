const XLSX = require('xlsx');
const path = require('path');

// Caminho do arquivo
const filePath = path.resolve(__dirname, 'C:\\PGC_Node\\docs\\pgc\\PGC 35.xlsx');

// Nome da aba principal (ajuste se necessário)
const sheetName = null; // null = primeira aba

const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(`Total de linhas: ${data.length}`);
console.log('Exemplo de linhas:');
console.log(data.slice(0, 5));

const nomes = data.map(row => row.NOME || row.Nome || row['Nome do Credor'] || row['CREDOR'] || row['Credor']).filter(Boolean);
console.log(`Total de nomes encontrados: ${nomes.length}`);
console.log('Primeiros nomes:', nomes.slice(0, 10));
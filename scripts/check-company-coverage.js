const XLSX = require('xlsx');
const filePath = 'C:\\PGC_Node\\docs\\pgc\\PGC 35.xlsx';

function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toDisplayText(v){return String(v??'').replace(/\s+/g,' ').trim();}
function parseNumber(value){
  const raw = String(value ?? '').trim(); if(!raw) return 0;
  let n = raw.replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
  const hasComma = n.includes(','); const hasDot = n.includes('.');
  if(hasComma && !hasDot) n = n.replace(/\./g,'').replace(',', '.'); else n = n.replace(/,/g,'');
  const num = Number(n); return Number.isFinite(num)?num:0;
}

const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets['PGC 35'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
// find pivot header row
const headerIndex = rows.findIndex((row) => {
  const normalized = (row||[]).map(c=>normalizeText(c));
  return normalized.includes('credor') && normalized.some(v=>v.includes('total geral'));
});
if(headerIndex<0) { console.log('pivot header not found'); process.exit(1);} 
const headerRow = rows[headerIndex]||[];
const totalIndex = headerRow.findIndex(c=>normalizeText(c).includes('total geral'));
const empresaCols = [];
for(let col=1; col<totalIndex; col++){
  const empresa = toDisplayText(headerRow[col]);
  if(empresa) empresaCols.push({index:col, empresa});
}
console.log('Found', empresaCols.length, 'empresa columns');
// choose empresas matching laghetto|golden
const matches = empresaCols.filter(e=>/laghetto|golden/i.test(e.empresa));
console.log('Companies matching /laghetto|golden/i:', matches.map(m=>m.empresa));
const credorSetPerCompany = {};
for(const m of matches){
  credorSetPerCompany[m.empresa] = new Set();
}
for(let r = headerIndex+1; r<rows.length; r++){
  const row = rows[r]||[];
  const credorRaw = toDisplayText(row[0]); if(!credorRaw) continue; if(normalizeText(credorRaw).includes('total geral')) continue;
  const credor = credorRaw.replace(/^\d+\s*-\s*/,'').trim();
  for(const m of matches){
    const v = parseNumber(row[m.index]);
    if(v!==0) credorSetPerCompany[m.empresa].add(credor);
  }
}
for(const m of matches){
  console.log('Company:', m.empresa, 'unique credores with non-zero value:', credorSetPerCompany[m.empresa].size);
}

// Also compute total unique credores in sheet
const allCredores = new Set();
for(let r = headerIndex+1; r<rows.length; r++){
  const row = rows[r]||[];
  const credorRaw = toDisplayText(row[0]); if(!credorRaw) continue; if(normalizeText(credorRaw).includes('total geral')) continue;
  const credor = credorRaw.replace(/^\d+\s*-\s*/,'').trim();
  allCredores.add(credor);
}
console.log('Total unique credores in pivot:', allCredores.size);

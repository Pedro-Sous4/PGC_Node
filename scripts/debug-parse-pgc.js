const XLSX = require('xlsx');
const path = require('path');

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toDisplayText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripCredorLeadingCode(value) {
  const text = toDisplayText(value);
  return text
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCredorDisplayName(value) {
  const cleaned = stripCredorLeadingCode(value);
  if (!cleaned) return '';
  const lowered = cleaned.toLowerCase();
  return lowered
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function parseNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  let normalized = raw.replace(/\s/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && !hasDot) {
    normalized = normalized.replace(/\./g, '').replace(/,/, '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function deriveMinimoRecordsFromLegacyLayout(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
  const records = [];
  if (rows.length < 8) return records;

  const headerRowAIndex = rows.findIndex((row, idx) => {
    if (idx > 20) return false;
    const normalized = (row ?? []).map((cell) => normalizeText(cell)).filter(Boolean);
    return (
      normalized.some((value) => value.includes('descontos')) &&
      normalized.some((value) => value.includes('empresa desconto'))
    );
  });

  if (headerRowAIndex < 0 || headerRowAIndex + 1 >= rows.length) return records;

  const headerRowA = rows[headerRowAIndex] ?? [];
  const headerRowB = rows[headerRowAIndex + 1] ?? [];
  const maxCols = Math.max(headerRowA.length, headerRowB.length);

  const headerAt = (col) => normalizeText(`${toDisplayText(headerRowA[col])} ${toDisplayText(headerRowB[col])}`);

  const findColumnIndex = (patterns) => {
    for (let col = 0; col < maxCols; col += 1) {
      const header = headerAt(col);
      if (!header) continue;
      if (patterns.some((pattern) => pattern.test(header))) return col;
    }
    return -1;
  };

  const colCredor = findColumnIndex([/\bcredor\b/, /beneficiario/, /favorecido/, /nome/]);
  const colMinimo = findColumnIndex([/minimo|valor liquido|valor liquido comissao a pagar|valor liquido|valor negociado|valor liquido comissao/]);
  const colEmpresaEmissao = findColumnIndex([/empresa emissao|empresa emissao nf|empresa emissao/]);
  const colCnpj = findColumnIndex([/cnpj|cpf/]);

  // find desconto pairs (desconto + empresa desconto)
  const descontoPairs = [];
  for (let col = 0; col < maxCols; col += 1) {
    const h = headerAt(col);
    if (!h) continue;
    if (/descontos?/.test(h)) {
      // try to find companion empresa desconto in nearby cols
      let companyCol = -1;
      for (let j = col + 1; j < Math.min(maxCols, col + 4); j += 1) {
        const hh = headerAt(j);
        if (/empresa desconto/.test(hh)) {
          companyCol = j; break;
        }
      }
      descontoPairs.push({ descontoCol: col, empresaCol: companyCol });
    }
  }

  const dataStartIndex = headerRowAIndex + 2;
  for (let rowIndex = dataStartIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const credorRaw = row[colCredor] ?? '';
    const credor = toCredorDisplayName(credorRaw);
    if (!credor) continue;

    const minimo = colMinimo >= 0 ? parseNumber(row[colMinimo]) : 0;
    if (minimo > 0) {
      records.push({ credor, tipo: 'minimo', valor: minimo });
    }
    for (const pair of descontoPairs) {
      const descontoValue = Math.abs(parseNumber(row[pair.descontoCol]));
      const empresaDesconto = pair.empresaCol >=0 ? toDisplayText(row[pair.empresaCol]) : '';
      if (descontoValue > 0 && empresaDesconto) {
        records.push({ credor, tipo: 'desconto', valor: descontoValue });
      }
    }
  }

  return records;
}

function deriveMinimoRecordsFromPivotLayout(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
  const records = [];
  const headerIndex = rows.findIndex((row) => {
    const normalized = (row ?? []).map((cell) => normalizeText(cell));
    return normalized.includes('credor') && normalized.some((value) => value.includes('total geral'));
  });
  if (headerIndex < 0) return records;
  const headerRow = rows[headerIndex] ?? [];
  const totalIndex = headerRow.findIndex((cell) => normalizeText(cell).includes('total geral'));
  if (totalIndex <= 1) return records;
  const empresaColumns = [];
  for (let col = 1; col < totalIndex; col += 1) {
    const empresa = toDisplayText(headerRow[col]);
    if (!empresa) continue;
    empresaColumns.push({ index: col, empresa });
  }

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const credorRaw = toDisplayText(row[0]);
    if (!credorRaw) continue;
    if (normalizeText(credorRaw).includes('total geral')) continue;
    const credor = toCredorDisplayName(credorRaw);
    if (!credor) continue;
    for (const column of empresaColumns) {
      const value = parseNumber(row[column.index]);
      if (value === 0) continue;
      records.push({ credor, tipo: 'minimo', valor: value, empresa: column.empresa });
    }
  }

  return records;
}

// Main
const filePath = 'C:\\PGC_Node\\docs\\pgc\\PGC 35.xlsx';
const workbook = XLSX.readFile(filePath);
console.log('Sheets:', workbook.SheetNames);
for (const name of workbook.SheetNames) {
  console.log('\n=== Sheet:', name, '===');
  const sheet = workbook.Sheets[name];
  const legacy = deriveMinimoRecordsFromLegacyLayout(sheet);
  const pivot = deriveMinimoRecordsFromPivotLayout(sheet);
  const uniqCredoresLegacy = Array.from(new Set(legacy.map(r => r.credor)));
  const uniqCredoresPivot = Array.from(new Set(pivot.map(r => r.credor)));
  console.log('legacy records:', legacy.length, 'unique credores:', uniqCredoresLegacy.length);
  console.log('pivot records:', pivot.length, 'unique credores:', uniqCredoresPivot.length);
  console.log('sample legacy:', legacy.slice(0,5));
  console.log('sample pivot:', pivot.slice(0,5));
}

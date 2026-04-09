import XLSX from 'xlsx';

type RowRecord = Record<string, string>;

type ParsedSheet = {
  records: RowRecord[];
  headers: string[];
  credorColumn?: string;
  cnpjColumn?: string;
};

type MinimoRecord = {
  credor: string;
  empresa: string;
  cnpj: string;
  minimo: number;
  desconto: number;
  total: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toSlug(value: unknown): string {
  return normalizeText(String(value)).replace(/\s+/g, '-');
}

function toDisplayText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseNumber(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  let normalized = raw.replace(/\s/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    normalized = normalized.replace(decimalSep, '.');
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '');
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizarNomeGolden(nome: string): string {
  let text = String(nome ?? '');
  text = text.replace(/^\s*\d+\s*[-–—:\._]*\s*/u, '');
  text = text.replace(/\([^)]*\)/g, '');
  text = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  text = text.replace(/[^\w\s]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim().toUpperCase();
  return text;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const row = rows[i] ?? [];
    const normalized = (row as unknown[])
      .map((cell) => normalizeText(cell))
      .filter(Boolean);
    if (
      normalized.some((value) => value.includes('credor')) &&
      normalized.some((value) => value.includes('minimo'))
    ) {
      return i;
    }
  }
  return -1;
}

function extractMinimoRecordsFromFixedPosition(rows: unknown[][]): MinimoRecord[] {
  const records: MinimoRecord[] = [];

  // Regra operacional: AA PGC [num_pgc] — linha inicial 8 (índice 7).
  const START_ROW = 7;

  for (let rowIndex = START_ROW; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];

    // Layout Golden-only: credor índice 31 (coluna deslocada em relação ao AG visual).
    // Fallback AG/AO/AP/AQ: índice 34 quando layout vier sem deslocamento.
    const credor = toDisplayText(row[31]) || toDisplayText(row[34]);
    // Mínimo: índice 39, fallback índice 40.
    const minimo = parseNumber(row[39]) || parseNumber(row[40]);
    const empresa = toDisplayText(row[40]);
    const cnpj = toDisplayText(row[41]);

    console.log({ linha: rowIndex + 1, credor, minimo, empresa, cnpj });

    if (!credor || minimo <= 0) continue;

    records.push({
      credor: normalizarNomeGolden(credor),
      empresa: empresa || '',
      cnpj: cnpj || '',
      minimo,
      desconto: 0,
      total: minimo,
    });
  }

  return records;
}

function extractMinimoRecordsFromHeaderNames(rows: unknown[][]): MinimoRecord[] {
  const records: MinimoRecord[] = [];
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0 || headerIndex + 1 >= rows.length) return records;

  const headerRow = rows[headerIndex] ?? [];
  const mappedColumn: {
    credor?: number;
    minimo?: number;
    empresa?: number;
    cnpj?: number;
  } = {};

  for (let col = 0; col < headerRow.length; col += 1) {
    const headerName = normalizeText(headerRow[col]);
    if (!headerName) continue;
    if (headerName.includes('credor')) mappedColumn.credor = col;
    if (headerName.includes('minimo') || headerName.includes('fixo')) mappedColumn.minimo = col;
    if (headerName.includes('empresa')) mappedColumn.empresa = mappedColumn.empresa ?? col;
    if (headerName.includes('cnpj')) mappedColumn.cnpj = col;
  }

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const credor = mappedColumn.credor !== undefined ? toDisplayText(row[mappedColumn.credor]) : '';
    const minimo = mappedColumn.minimo !== undefined ? parseNumber(row[mappedColumn.minimo]) : 0;
    const empresa = mappedColumn.empresa !== undefined ? toDisplayText(row[mappedColumn.empresa]) : '';
    const cnpj = mappedColumn.cnpj !== undefined ? toDisplayText(row[mappedColumn.cnpj]) : '';

    console.log({ linha: rowIndex + 1, credor, minimo, empresa, cnpj });

    if (!credor || minimo <= 0) continue;

    records.push({
      credor: normalizarNomeGolden(credor),
      empresa: empresa || '',
      cnpj: cnpj || '',
      minimo,
      desconto: 0,
      total: minimo,
    });
  }

  return records;
}

export async function deriveMinimoRecordsGolden(
  worksheet: XLSX.WorkSheet,
  baseSheet: ParsedSheet,
  cnpjFallback: Map<string, string>,
  empresaCnpjMap: Map<string, string>,
): Promise<MinimoRecord[]> {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][];

  const pgcCount = rows.filter((row) => (row as unknown[]).some((cell) => /pgc\s*\d+/i.test(String(cell)))).length;
  if (pgcCount > 1) {
    console.warn('laghetto-golden: múltiplas abas PGC encontradas. Verifique conflito de definições. Numero(s):', pgcCount);
  }

  const descontoColumnNames = new Set<string>();
  for (const row of rows.slice(0, 6)) {
    for (const cell of row as unknown[]) {
      const text = normalizeText(cell);
      if (/desconto|inadimplencia|distrato/.test(text)) {
        descontoColumnNames.add(text);
      }
    }
  }

  if (descontoColumnNames.size > 0) {
    console.log('laghetto-golden: colunas de desconto/inadimplencia/distrato detectadas:', [ ...descontoColumnNames ]);
  }

  let records = extractMinimoRecordsFromFixedPosition(rows);
  if (records.length === 0) {
    console.log('laghetto-golden: falha no parse posicionais, aplicando fallback por nomes de coluna');
    records = extractMinimoRecordsFromHeaderNames(rows);
  }

  const totalLidos = rows.length;
  const validos = records.length;
  const ignorados = totalLidos - validos;

  console.log({ totalLidos, validos, ignorados });

  const baseCredores = new Set<string>();
  if (baseSheet.credorColumn) {
    for (const baseRow of baseSheet.records) {
      const raw = baseRow[baseSheet.credorColumn];
      if (!raw) continue;
      baseCredores.add(toSlug(normalizarNomeGolden(raw)));
    }
  }

  const minimoBySlug = new Map<string, MinimoRecord[]>();
  for (const rec of records) {
    const slug = toSlug(rec.credor);
    if (!minimoBySlug.has(slug)) minimoBySlug.set(slug, []);
    minimoBySlug.get(slug)?.push(rec);
  }

  const credoresComMinimo = new Set<string>();

  for (const slug of baseCredores) {
    const match = minimoBySlug.get(slug) ?? [];
    if (match.length === 0) {
      console.warn('Credor sem mínimo:', slug);
    } else {
      credoresComMinimo.add(slug);
      if (match.length > 1) {
        console.warn('Duplicidade no mínimo para credor:', slug, 'encontrados', match.length);
      }
    }
  }

  const credoresSemMinimo = Array.from(baseCredores).filter((slug) => !credoresComMinimo.has(slug));
  console.log({ totalCredoresBase: baseCredores.size, totalMinimos: records.length, credoresComMinimo: credoresComMinimo.size, credoresSemMinimo: credoresSemMinimo.length });

  // para cada registro de mínimo, preencher cnpj com fallback
  const normalizedRecords = records.map((row) => {
    const credorSlug = toSlug(row.credor);
    const cnpjFromBase = cnpjFallback.get(credorSlug) ?? '';
    const cnpjEmpresa = row.empresa ? (empresaCnpjMap.get(row.empresa) || '') : '';
    return {
      ...row,
      cnpj: row.cnpj || cnpjFromBase || cnpjEmpresa || '',
    };
  });

  return normalizedRecords;
}

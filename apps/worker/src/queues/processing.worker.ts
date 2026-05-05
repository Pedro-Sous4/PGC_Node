import { Worker } from 'bullmq';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { isJobCanceled, postProgress } from '../clients/api.client';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function shouldStop(requestId: string): Promise<boolean> {
  return isJobCanceled(requestId);
}

async function reportProgress(
  requestId: string,
  payload: Parameters<typeof postProgress>[1],
): Promise<void> {
  try {
    await postProgress(requestId, payload);
  } catch {
    // Progress reporting is best-effort and must not fail the whole processing.
  }
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function withProgressHeartbeat<T>(
  requestId: string,
  payload: { stage: string; percent: number; currentCredor?: string },
  work: () => Promise<T>,
  intervalMs = Number(process.env.PROGRESS_HEARTBEAT_MS ?? 12_000),
): Promise<T> {
  let stopped = false;
  let posting = false;

  const tick = async () => {
    if (stopped || posting) return;
    posting = true;
    try {
      await postProgress(requestId, {
        stage: payload.stage,
        percent: payload.percent,
        status: 'PROCESSING',
        currentCredor: payload.currentCredor,
      });
    } catch {
      // Heartbeat is best-effort. Main processing must continue.
    } finally {
      posting = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  try {
    await tick();
    return await work();
  } finally {
    stopped = true;
    clearInterval(timer);
  }
}

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
  valorBruto: number;
  total: number;
};

type DiscountLedgerEntry = {
  empresa: string;
  descontoAtual: number;
  carryoverAnterior: number;
  aplicadoNoPgc: number;
  saldoProximoPgc: number;
  observacao: string;
};

type SheetValue = string | number;
type SheetRecord = Record<string, SheetValue>;

type CompanyIdentity = {
  fullName: string;
  cnpj: string;
};

type DiscountHistoryState = Map<string, number>;


type DiscountHistoryLogEntry = {
  createdAt: string;
  requestId: string;
  numeroPgc: string;
  credorSlug: string;
  credorName: string;
  empresa: string;
  descontoAtual: number;
  carryoverAnterior: number;
  aplicadoNoPgc: number;
  saldoProximoPgc: number;
};

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toSlug(value: unknown): string {
  return normalizeText(stripCredorLeadingCode(value)).replace(/\s+/g, '-');
}

function toDisplayText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripCredorLeadingCode(value: unknown): string {
  const text = toDisplayText(value);
  return text
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCredorDisplayName(value: unknown): string {
  const cleaned = stripCredorLeadingCode(value);
  if (!cleaned) return '';

  const lowered = cleaned.toLowerCase();
  return lowered
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
    .trim();
}

function normalizeEmpresaKey(value: unknown): string {
  const text = toDisplayText(value)
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  return normalizeText(text);
}


function parseNumber(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  let normalized = raw.replace(/\s/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Decide decimal separator by the last separator in the token.
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';

    normalized = normalized.split(thousandSep).join('');
    if (decimalSep === ',') {
      normalized = normalized.replace(',', '.');
    }
  } else if (hasDot) {
    // Heuristic for thousands with dot (e.g. "1.275" => 1275), while
    // preserving decimals (e.g. "1.28" => 1.28).
    const parts = normalized.split('.');
    const hasMultipleDots = parts.length > 2;
    const looksLikeThousands = hasMultipleDots || (parts.length === 2 && /^\d{3}$/.test(parts[1]));
    if (looksLikeThousands) {
      normalized = normalized.replace(/\./g, '');
    }
  } else if (hasComma) {
    // Heuristic for thousands with comma (e.g. "1,275" => 1275), while
    // preserving decimals (e.g. "1,28" => 1.28).
    const parts = normalized.split(',');
    const hasMultipleCommas = parts.length > 2;
    const looksLikeThousands = hasMultipleCommas || (parts.length === 2 && /^\d{3}$/.test(parts[1]));
    if (looksLikeThousands) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDocument(value: unknown): string {
  const raw = toDisplayText(value);
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 14) {
    return raw;
  }
  return '';
}

function formatMoneyBR(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const signal = safeValue < 0 ? '-' : '';
  const absolute = Math.abs(safeValue);
  const [integerPart, decimalPart] = absolute.toFixed(2).split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signal}R$ ${groupedInteger},${decimalPart}`;
}

function isMoneyColumn(header: string): boolean {
  const normalized = normalizeText(header);
  return /(valor|total|minimo|desconto|liquido|bruto|saldo)/.test(normalized);
}

function normalizeCurrencyColumns(rows: RowRecord[]): SheetRecord[] {
  return rows.map((row) => {
    const formatted: SheetRecord = {};

    for (const [key, value] of Object.entries(row)) {
      const text = toDisplayText(value);
      if (!text || !isMoneyColumn(key)) {
        formatted[key] = value;
        continue;
      }

      formatted[key] = parseNumber(text);
    }

    return formatted;
  });
}

const EXCEL_CURRENCY_FORMAT = '[$R$-416] #,##0.00';

function applyCurrencyFormatByHeaders(worksheet: XLSX.WorkSheet, headers: string[]): void {
  const ref = worksheet['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);
  if (range.e.r < 1) return;

  const moneyColumns = new Set<number>();
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const headerValue = String(worksheet[cellAddress]?.v ?? headers[col - range.s.c] ?? '').trim();
    if (isMoneyColumn(headerValue)) {
      moneyColumns.add(col);
    }
  }

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    for (const col of moneyColumns) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;

      if (cell.t !== 'n') {
        const numeric = parseNumber(cell.v);
        cell.t = 'n';
        cell.v = numeric;
      }

      cell.z = EXCEL_CURRENCY_FORMAT;
    }
  }
}

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  const parent = path.dirname(cwd);
  const grandParent = path.dirname(parent);

  if (path.basename(cwd) === 'worker' && path.basename(parent) === 'apps') {
    return grandParent;
  }

  return cwd;
}

function buildDiscountHistoryKey(credorSlug: string, empresa: string): string {
  return `${credorSlug}::${normalizeEmpresaKey(empresa)}`;
}

function resolveDiscountHistoryFiles(flow: string) {
  const workspaceRoot = resolveWorkspaceRoot();
  const baseDir = path.join(workspaceRoot, 'PGC', flow.toUpperCase());
  return {
    saldoFilePath: path.join(baseDir, 'descontos-saldo.json'),
    logFilePath: path.join(baseDir, 'descontos-historico.json'),
  };
}

async function loadDiscountHistoryState(flow: string): Promise<DiscountHistoryState> {
  const { saldoFilePath } = resolveDiscountHistoryFiles(flow);
  const map: DiscountHistoryState = new Map();

  const exists = await fs
    .stat(saldoFilePath)
    .then((st) => st.isFile())
    .catch(() => false);
  if (!exists) return map;

  try {
    const raw = await fs.readFile(saldoFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [key, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) continue;

      const [credorSlugRaw, empresaRaw] = String(key).split('::');
      if (!credorSlugRaw || !empresaRaw) continue;

      const normalizedKey = buildDiscountHistoryKey(credorSlugRaw, empresaRaw);
      if (!normalizedKey.endsWith('::')) {
        map.set(normalizedKey, Number(numeric.toFixed(2)));
      }
    }
  } catch {
    // Ignore malformed file and continue with empty state.
  }

  return map;
}

async function persistDiscountHistoryState(flow: string, state: DiscountHistoryState): Promise<void> {
  const { saldoFilePath } = resolveDiscountHistoryFiles(flow);
  await fs.mkdir(path.dirname(saldoFilePath), { recursive: true });

  const serialized: Record<string, number> = {};
  for (const [key, value] of state.entries()) {
    if (value > 0) {
      serialized[key] = Number(value.toFixed(2));
    }
  }

  await fs.writeFile(saldoFilePath, JSON.stringify(serialized, null, 2), 'utf8');
}

async function appendDiscountHistoryLog(
  flow: string,
  entries: DiscountHistoryLogEntry[],
): Promise<void> {
  const { logFilePath } = resolveDiscountHistoryFiles(flow);
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });

  const existing = await fs
    .readFile(logFilePath, 'utf8')
    .then((raw) => {
      const parsed = JSON.parse(raw) as DiscountHistoryLogEntry[];
      return Array.isArray(parsed) ? parsed : [];
    })
    .catch(() => [] as DiscountHistoryLogEntry[]);

  existing.push(...entries);
  await fs.writeFile(logFilePath, JSON.stringify(existing, null, 2), 'utf8');
}

function applyDiscountsForCredor(
  credorSlug: string,
  minimoRows: MinimoRecord[],
  historyState: DiscountHistoryState,
  baseRows: RowRecord[],
  baseHeaders: string[],
  companyMap: Map<string, CompanyIdentity>,
): { adjustedRows: MinimoRecord[]; ledger: DiscountLedgerEntry[] } {
  const hasMinimo = minimoRows.length > 0;
  const hasBase = baseRows.length > 0;
  const hasHistory = Array.from(historyState.keys()).some((k) => k.startsWith(`${credorSlug}::`));

  if (!hasMinimo && !hasBase && !hasHistory) {
    return { adjustedRows: minimoRows, ledger: [] };
  }

  const adjustedRows: MinimoRecord[] = minimoRows.map((row) => ({
    ...row,
    desconto: 0,
    total: Number(((row.valorBruto || 0) + (row.minimo || 0)).toFixed(2)),
  }));

  const resolvedCompanies = new Set<string>(); // Set of fullNames
  const identityByResolvedName = new Map<string, CompanyIdentity>();
  const availableByResolvedName = new Map<string, number>();
  const currentDiscountByResolvedName = new Map<string, number>();

  for (const original of minimoRows) {
    const identity = resolveCompanyIdentity(original.empresa, companyMap);
    const resolvedName = identity.fullName || original.empresa;
    if (!resolvedName) continue;

    resolvedCompanies.add(resolvedName);
    identityByResolvedName.set(resolvedName, identity);
    
    // Agora o saldo disponível inclui tanto o Mínimo quanto o Valor Bruto da empresa
    const saldoLinha = Number(((original.minimo || 0) + (original.valorBruto || 0)).toFixed(2));
    availableByResolvedName.set(resolvedName, (availableByResolvedName.get(resolvedName) ?? 0) + saldoLinha);

    const currentDiscount = Math.abs(Number(original.desconto ?? 0));
    if (currentDiscount > 0) {
      currentDiscountByResolvedName.set(resolvedName, (currentDiscountByResolvedName.get(resolvedName) ?? 0) + currentDiscount);
    }
  }

  const totalAvailableFromMinimo = Array.from(availableByResolvedName.values()).reduce((acc, value) => acc + value, 0);
  if (totalAvailableFromMinimo <= 0) {
    const empresaColumns = baseHeaders.filter((header) => /empresa/.test(normalizeText(header)));
    const valorColumns = baseHeaders.filter((header) => /valor original|^valor$|valor|total geral/.test(normalizeText(header)));

    if (empresaColumns.length > 0 && valorColumns.length > 0) {
      for (const row of baseRows) {
        const empresaRaw = empresaColumns.map((header) => toDisplayText(row[header])).find((value) => value !== '');
        if (!empresaRaw) continue;

        const identity = resolveCompanyIdentity(empresaRaw, companyMap);
        const resolvedName = identity.fullName || empresaRaw;
        if (!resolvedName) continue;

        const valorRaw = valorColumns.map((header) => row[header]).find((value) => parseNumber(value) > 0);
        const valor = Math.max(0, parseNumber(valorRaw));
        if (valor <= 0) continue;

        resolvedCompanies.add(resolvedName);
        identityByResolvedName.set(resolvedName, identity);
        availableByResolvedName.set(resolvedName, Number(((availableByResolvedName.get(resolvedName) ?? 0) + valor).toFixed(2)));
      }
    }
  }

  for (const key of historyState.keys()) {
    if (!key.startsWith(`${credorSlug}::`)) continue;
    const empresaRaw = key.slice(`${credorSlug}::`.length);
    const identity = resolveCompanyIdentity(empresaRaw, companyMap);
    const resolvedName = identity.fullName || empresaRaw;
    if (resolvedName) {
      resolvedCompanies.add(resolvedName);
      identityByResolvedName.set(resolvedName, identity);
    }
  }

  const ledger: DiscountLedgerEntry[] = [];

  for (const resolvedName of resolvedCompanies) {
    const historyKey = `${credorSlug}::${resolvedName}`;
    const carryoverAnterior = historyState.get(historyKey) ?? 0;
    const descontoAtual = currentDiscountByResolvedName.get(resolvedName) ?? 0;
    const demandaTotal = Number((descontoAtual + carryoverAnterior).toFixed(2));

    if (demandaTotal <= 0) {
      historyState.delete(historyKey);
      continue;
    }

    const saldoDisponivel = Number((availableByResolvedName.get(resolvedName) ?? 0).toFixed(2));
    let aplicadoNoPgc = Number(Math.min(demandaTotal, saldoDisponivel).toFixed(2));
    const aplicadoPlanejado = aplicadoNoPgc;
    let restanteAplicar = aplicadoNoPgc;

    for (const row of adjustedRows) {
      const rowIdentity = resolveCompanyIdentity(row.empresa, companyMap);
      if ((rowIdentity.fullName || row.empresa) !== resolvedName || restanteAplicar <= 0) continue;
      
      const descontoLinha = Number(Math.min(row.total, restanteAplicar).toFixed(2));
      if (descontoLinha <= 0) continue;

      row.desconto = Number((row.desconto + descontoLinha).toFixed(2));
      row.total = Number((row.total - descontoLinha).toFixed(2));
      restanteAplicar = Number((restanteAplicar - descontoLinha).toFixed(2));
    }

    const aplicadoDistribuido = Number((aplicadoNoPgc - Math.max(0, restanteAplicar)).toFixed(2));
    const semDistribuicaoPorLinha = aplicadoDistribuido <= 0 && aplicadoPlanejado > 0;
    aplicadoNoPgc =
      totalAvailableFromMinimo <= 0 && semDistribuicaoPorLinha ? aplicadoPlanejado : aplicadoDistribuido;
    const saldoProximoPgc = Number(Math.max(0, demandaTotal - aplicadoNoPgc).toFixed(2));

    if (saldoProximoPgc > 0) {
      historyState.set(historyKey, saldoProximoPgc);
    } else {
      historyState.delete(historyKey);
    }

    const identity = identityByResolvedName.get(resolvedName);
    ledger.push({
      empresa: identity?.fullName || resolvedName,
      descontoAtual,
      carryoverAnterior,
      aplicadoNoPgc,
      saldoProximoPgc,
      observacao:
        saldoProximoPgc > 0
          ? 'Saldo insuficiente na empresa; diferenca mantida para proximo PGC.'
          : 'Desconto aplicado integralmente no PGC atual.',
    });
  }

  return { adjustedRows, ledger };
}

async function listExcelFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(xlsx|xlsm|xls)$/i.test(name))
      .map((name) => path.join(dirPath, name));
  } catch {
    return [];
  }
}

const DEFAULT_EMPRESA_CNPJ: Array<{ empresa: string; cnpj: string }> = [
  { empresa: 'RISERVA DOS VINHEDOS INCORPORADORA SPE LTDA', cnpj: '34.028.040/0003-25' },
  { empresa: 'ALTOS DA BORGES EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '40.024.035/0001-85' },
  { empresa: 'LGM PARTICIPACOES LTDA | FILIAL PEDRAS ALTAS', cnpj: '48.896.217/0024-44' },
  { empresa: 'GVP PARTICIPACOES E INVESTIMENTOS LTDA', cnpj: '17.991.041/0001-90' },
  { empresa: 'GOLDEN LAGHETTO EMPREENDIMENTOS IMOBILIARIOS SPE LTD', cnpj: '23.585.934/0003-08' },
  { empresa: 'ATHIVABRASIL EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '08.705.893/0001-82' },
  { empresa: 'CANELA EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '30.145.972/0002-16' },
  { empresa: 'ASA DELTA EMPREENDIMENTOS IMOBILIARIOS LTDA', cnpj: '30.182.622/0004-91' },
  { empresa: 'LGM PARTICIPACOES LTDA | FILIAL BORGES', cnpj: '48.896.217/0004-09' },
  { empresa: 'LSRG RESORT SPE LTDA SCP', cnpj: '49.850.335/0001-98' },
  { empresa: 'SCI RESORT SPE LTDA SCP', cnpj: '49.729.088/0001-76' },
  { empresa: 'JPZ EMPREENDIMENTOS LTDA', cnpj: '48.896.217/0024-44' },
];

async function loadEmpresaCnpjMap(baseDir: string): Promise<Map<string, CompanyIdentity>> {
  const map = new Map<string, CompanyIdentity>();
  const workspaceRoot = resolveWorkspaceRoot();

  // 1. Load Defaults (fallback interno)
  for (const item of DEFAULT_EMPRESA_CNPJ) {
    const key = item.empresa.toUpperCase();
    map.set(key, { fullName: item.empresa, cnpj: item.cnpj });
  }

  // 2. Load from System Settings (Fonte Primária)
  const settingsPath = path.join(workspaceRoot, 'apps', 'api', '.runtime', 'system-settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(content) as {
      empresasCnpj?: Array<{ empresa?: string; cnpj?: string; apelido?: string }>;
    };

    for (const item of parsed.empresasCnpj ?? []) {
      const empresa = toDisplayText(item.empresa);
      const cnpj = toDisplayText(item.cnpj);
      const apelido = toDisplayText(item.apelido);
      if (!empresa || !cnpj) continue;

      const identity: CompanyIdentity = { fullName: empresa, cnpj };
      
      // Mapeia pelo nome oficial
      map.set(empresa.toUpperCase(), identity);
      
      // Mapeia pelo apelido, se existir e for válido
      if (apelido && apelido.length >= 2) {
        map.set(apelido.toUpperCase(), identity);
      }
    }
  } catch {
    // Ignore error, mantém os defaults
  }

  return map;
}

function resolveCompanyIdentity(
  input: string,
  companyMap: Map<string, CompanyIdentity>,
): CompanyIdentity {
  const raw = toDisplayText(input);
  if (!raw) return { fullName: '', cnpj: '' };

  const key = raw.toUpperCase();
  const found = companyMap.get(key);
  if (found) return found;

  // Fallback: search by canonical name
  const canonical = normalizeEmpresaKey(raw);
  for (const [mapKey, identity] of companyMap.entries()) {
    if (normalizeEmpresaKey(mapKey) === canonical) {
      return identity;
    }
  }

  // Final fallback: return input as name with empty cnpj
  return { fullName: raw, cnpj: '' };
}

async function resolveInputWorkbook(requestId: string, flow?: string): Promise<string> {
  const workspaceRoot = resolveWorkspaceRoot();
  const normalizedFlow = String(flow ?? '').toLowerCase();

  const sportsCandidates = [
    path.join(workspaceRoot, 'artifacts', 'sports', requestId),
    path.join(workspaceRoot, 'apps', 'api', 'artifacts', 'sports', requestId),
  ];

  const lgmCandidates = [
    path.join(workspaceRoot, 'artifacts', 'lgm', requestId),
    path.join(workspaceRoot, 'apps', 'api', 'artifacts', 'lgm', requestId),
  ];

  const candidates =
    normalizedFlow === 'lgm'
      ? [...lgmCandidates, ...sportsCandidates]
      : normalizedFlow === 'laghetto-sports'
        ? [...sportsCandidates, ...lgmCandidates]
        : [...sportsCandidates, ...lgmCandidates];

  for (const folder of candidates) {
    const files = await listExcelFiles(folder);
    if (files.length === 0) continue;

    const withStats = await Promise.all(
      files.map(async (filePath) => ({
        filePath,
        stat: await fs.stat(filePath),
      })),
    );

    withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return withStats[0].filePath;
  }

  throw new Error('INPUT_WORKBOOK_NOT_FOUND');
}

function findSheetName(sheetNames: string[], matcher: RegExp): string | undefined {
  return sheetNames.find((name) => matcher.test(normalizeText(name)));
}

function extractPgcNumber(sheetName: string, fileName: string): string {
  const fromSheet = sheetName.match(/pgc\s*[-_ ]?(\d{1,6})/i)?.[1];
  if (fromSheet) return fromSheet;

  const fromFile = fileName.match(/pgc\s*[-_ ]?(\d{1,6})/i)?.[1];
  return fromFile ?? '0000';
}

function buildUniqueHeaders(rawHeader: unknown[]): string[] {
  const used = new Set<string>();
  return rawHeader.map((cell, index) => {
    const base = toDisplayText(cell) || `COL_${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function detectHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 40);
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] ?? [];
    const score = row.filter((cell) => toDisplayText(cell) !== '').length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function detectColumn(headers: string[], patterns: RegExp[]): string | undefined {
  const normalized = headers.map((header) => ({
    original: header,
    normalized: normalizeText(header),
  }));

  return normalized.find((header) => patterns.some((pattern) => pattern.test(header.normalized)))?.original;
}

function parseTabularSheet(worksheet: XLSX.WorkSheet): ParsedSheet {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][];

  if (rows.length === 0) {
    return { records: [], headers: [] };
  }

  const headerIndex = detectHeaderRow(rows);
  const headers = buildUniqueHeaders(rows[headerIndex] ?? []);
  const records: RowRecord[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const record: RowRecord = {};
    let nonEmpty = 0;

    for (let col = 0; col < headers.length; col += 1) {
      const value = toDisplayText(row[col]);
      record[headers[col]] = value;
      if (value !== '') nonEmpty += 1;
    }

    if (nonEmpty > 0) {
      records.push(record);
    }
  }

  const credorColumn = detectColumn(headers, [/\bcredor\b/, /beneficiario/, /favorecido/, /nome/]);
  const cnpjColumn = detectColumn(headers, [/\bcnpj\b/, /cpf/]);

  return { records, headers, credorColumn, cnpjColumn };
}

function buildCnpjFallbackMap(base: ParsedSheet): Map<string, string> {
  const map = new Map<string, string>();
  if (!base.credorColumn || !base.cnpjColumn) return map;

  for (const row of base.records) {
    const credor = row[base.credorColumn];
    const cnpj = normalizeDocument(row[base.cnpjColumn]);
    if (!credor || !cnpj) continue;

    const key = toSlug(credor);
    if (!key || map.has(key)) continue;
    map.set(key, cnpj);
  }

  return map;
}

function derivePgcMasterRecords(
  worksheet: XLSX.WorkSheet,
  cnpjFallback: Map<string, string>,
  companyMap: Map<string, CompanyIdentity>,
): MinimoRecord[] {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][];

  const records: MinimoRecord[] = [];
  if (rows.length < 5) return records;

  const headerRowAIndex = rows.findIndex((row, idx) => {
    if (idx > 30) return false;
    const normalized = (row ?? []).map((cell) => normalizeText(cell)).filter(Boolean);
    return (
      normalized.some((value) => value.includes('credor')) &&
      (normalized.some((value) => value.includes('minimo')) ||
        normalized.some((value) => value.includes('bruto')) ||
        normalized.some((value) => value.includes('total')))
    );
  });

  if (headerRowAIndex < 0) return records;

  const headerRowBIndex = headerRowAIndex + 1 < rows.length ? headerRowAIndex : headerRowAIndex;
  const dataStartIndex = Math.max(headerRowAIndex, headerRowBIndex) + 1;

  const headerRowA = rows[headerRowAIndex] ?? [];
  const headerRowB = rows[headerRowBIndex] ?? [];
  const maxCols = Math.max(headerRowA.length, headerRowB.length);

  const headerAt = (col: number): string =>
    normalizeText(`${toDisplayText(headerRowA[col])} ${toDisplayText(headerRowB[col])}`);

  const findLastColumnIndex = (patterns: RegExp[]): number => {
    let found = -1;
    for (let col = 0; col < maxCols; col += 1) {
      const header = headerAt(col);
      if (!header) continue;
      if (patterns.some((pattern) => pattern.test(header))) {
        found = col;
      }
    }
    return found;
  };

  const colCredor = findLastColumnIndex([/\bcredor\b/]);
  const colMinimo = findLastColumnIndex([/minimo\/fixo\s*garantido\s*para\s*emissao\s*nf/i, /m[íi]nimo\/fixo/, /valor\s*fixo/, /m[íi]nimo\s*garantido/, /m[íi]nimo\s*reten[çc][ãa]o/]);
  const colBruto = findLastColumnIndex([/valor\s*liquido\s*comiss[ãa]o\s*a\s*pagar/i, /valor\s*bruto/, /total\s*geral/]);
  const colEmpresaEmissao = findLastColumnIndex([/empresa\s*emissao/, /emissor/]);
  const colCnpj = findLastColumnIndex([/\bcnpj\b/]);
  
  // Detecção dinâmica de pares (Desconto + Empresa Desconto)
  const descontoPairs: Array<{ descontoCol: number; empresaCol: number }> = [];
  for (let col = 0; col < maxCols - 1; col += 1) {
    const currentHeader = headerAt(col);
    const nextHeader = headerAt(col + 1);

    const isDescontoCol = /\boutros\s*descontos\b|\bdescontos\b/.test(currentHeader);
    const isEmpresaDescontoCol = /empresa\s*desconto/.test(nextHeader);
    if (isDescontoCol && isEmpresaDescontoCol) {
      descontoPairs.push({ descontoCol: col, empresaCol: col + 1 });
      col += 1; // Pula a coluna da empresa que já consumimos
    }
  }

  if (colCredor < 0) return records;

  for (let rowIndex = dataStartIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const credor = toCredorDisplayName(row[colCredor]);
    if (!credor) continue;
    if (normalizeText(credor).includes('total geral')) continue;

    // Detecção de colunas que podem conter texto de "MÍNIMO"
    const colDescricoes: number[] = [];
    for (let col = 0; col < maxCols; col += 1) {
      if (col === colCredor) continue;
      const h = headerAt(col);
      if (/descri[çc][ãa]o|obs|item|tipo/.test(h)) {
        colDescricoes.push(col);
      }
    }

    // Detecção de colunas que podem conter texto de "MÍNIMO"
    let minimoAcumulado = colMinimo >= 0 ? parseNumber(row[colMinimo]) : 0;
    let descricaoMinimo = 'Mínimo garantido';
    
    // Procura por colunas que tenham textos específicos no conteúdo (Apenas se não achamos a coluna AO via header)
    if (colMinimo < 0) {
      for (let col = 0; col < maxCols; col += 1) {
        const cellValue = toDisplayText(row[col]);
        const match = cellValue.match(/m[íi]nimo\s*garantido|m[íi]nimo\s*reten[çc][ãa]o|m[íi]nimo/i);
        if (match) {
          descricaoMinimo = match[0];
          const valAtual = parseNumber(row[col]);
          const valProximo = parseNumber(row[col + 1]);
          const valDetectado = Math.max(valAtual, valProximo);
          if (valDetectado > 0) {
            minimoAcumulado = valDetectado;
            break; // Pega o primeiro significativo
          }
        }
      }
    }

    const valorBruto = colBruto >= 0 ? parseNumber(row[colBruto]) : 0;
    const empresaEmissaoRaw = colEmpresaEmissao >= 0 ? toDisplayText(row[colEmpresaEmissao]) : '';
    const cnpjFromRow = colCnpj >= 0 ? normalizeDocument(row[colCnpj]) : '';
    const credorSlug = toSlug(credor);
    const cnpjByCredor = cnpjFallback.get(credorSlug) ?? '';

    const identity = resolveCompanyIdentity(empresaEmissaoRaw, companyMap);
    
    // Registro Mestre (Bruto e Mínimo)
    records.push({
      credor,
      empresa: identity.fullName || empresaEmissaoRaw,
      cnpj: cnpjFromRow || cnpjByCredor || identity.cnpj || '',
      minimo: minimoAcumulado,
      desconto: 0,
      valorBruto,
      total: Number((valorBruto + minimoAcumulado).toFixed(2)),
      descricao: descricaoMinimo,
    });

    // Registros Auxiliares (Descontos por Empresa)
    for (const pair of descontoPairs) {
      const descontoValue = Math.abs(parseNumber(row[pair.descontoCol]));
      const empresaDescontoRaw = toDisplayText(row[pair.empresaCol]);
      if (!empresaDescontoRaw || descontoValue <= 0) continue;

      const discountIdentity = resolveCompanyIdentity(empresaDescontoRaw, companyMap);
      records.push({
        credor,
        empresa: discountIdentity.fullName || empresaDescontoRaw,
        cnpj: cnpjByCredor || discountIdentity.cnpj || '',
        minimo: 0,
        desconto: descontoValue,
        valorBruto: 0,
        total: 0, // Desconto puro
      });
    }
  }

  return records;
}


function deriveMinimoRecordsFromGoldenFixedLayout(
  worksheet: XLSX.WorkSheet,
  cnpjFallback: Map<string, string>,
  empresaCnpjMap: Map<string, string>,
): MinimoRecord[] {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
    range: 0, 
  }) as unknown[][];

  const records: MinimoRecord[] = [];
  
  let headerRowIndex = -1;
  for (let i = 0; i < 20; i++) {
    const row = (rows[i] || []).map(c => normalizeText(c));
    if (row.includes('credor') || row.includes('nome')) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = headerRowIndex !== -1 ? (rows[headerRowIndex] || []).map((cell) => normalizeText(cell)) : [];
  let colCredor = headerRow.findIndex((h) => h.includes('credor') || h === 'nome');
  let colMinimo = headerRow.findIndex((h) => h.includes('minimo') || h.includes('fixo') || h.includes('fec'));
  let colEmpresa = headerRow.findIndex((h) => h.includes('empresa') || h.includes('emissao'));
  let colCnpj = headerRow.findIndex((h) => h.includes('cnpj'));

  const START_ROW = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

  for (let i = START_ROW; i < rows.length; i++) {
    const row = rows[i] || [];
    
    // Busca o nome: prioriza a coluna detectada ou as colunas AG (32) / AF (31)
    let credorRaw = '';
    const potentialIndices = [colCredor, 32, 31].filter(idx => idx !== -1);
    for (const idx of potentialIndices) {
      const val = String(row[idx] || '').trim();
      if (val.length > 5) {
        credorRaw = val;
        break;
      }
    }

    if (!credorRaw) continue;

    // Validação estrita do nome para evitar lixo (como "Total Geral", "R$ 1.000", etc)
    const normalizedName = normalizeText(credorRaw);
    if (
      normalizedName.includes('total') || 
      normalizedName.includes('geral') || 
      normalizedName.includes('comissao') ||
      normalizedName.includes('venda') ||
      normalizedName.includes('emissao') ||
      normalizedName.includes('r$') ||
      /\d/.test(credorRaw) // Nomes de credores não costumam ter números (exceto CNPJ que tratamos depois)
    ) {
      continue;
    }

    const credor = toCredorDisplayName(credorRaw);
    if (!credor || !credor.includes(' ')) continue;

    // Busca o valor do mínimo
    let minimo = colMinimo !== -1 ? parseNumber(row[colMinimo]) : 0;
    if (minimo <= 0) {
      // Escaneia a linha em busca de um valor monetário razoável
      for (let idx = 10; idx < row.length; idx++) {
        if (idx === colCredor || idx === 31 || idx === 32) continue;
        const val = parseNumber(row[idx]);
        if (val > 0 && val < 50000) {
          minimo = val;
          break;
        }
      }
    }

    if (minimo <= 0) continue;

    const empresa = toDisplayText(row[colEmpresa]) || toDisplayText(row[40]) || '';
    const cnpj = normalizeDocument(row[colCnpj]) || normalizeDocument(row[41]) || '';
    
    const credorSlug = toSlug(credor);
    const cnpjFromBase = cnpjFallback.get(credorSlug) ?? '';
    const cnpjByEmpresa = empresa ? resolveCnpjForEmpresa(empresa, empresaCnpjMap) : '';

    records.push({
      credor,
      empresa: empresa || '',
      cnpj: cnpj || cnpjFromBase || cnpjByEmpresa || '',
      minimo,
      desconto: 0,
      total: minimo,
    });
  }

  return records;
}

function deriveMinimoRecords(
  worksheet: XLSX.WorkSheet,
  cnpjFallback: Map<string, string>,
  companyMap: Map<string, CompanyIdentity>,
): MinimoRecord[] {
<<<<<<< HEAD
  return derivePgcMasterRecords(worksheet, cnpjFallback, companyMap);
=======
  const golden = deriveMinimoRecordsFromGoldenFixedLayout(worksheet, cnpjFallback, empresaCnpjMap);
  if (golden.length > 0) return golden;

  const legacy = deriveMinimoRecordsFromLegacyLayout(worksheet, cnpjFallback, empresaCnpjMap);
  const pivot = deriveMinimoRecordsFromPivotLayout(worksheet, cnpjFallback, empresaCnpjMap);

  const legacyHasExplicitDiscount = legacy.some((row) => Number(row.desconto ?? 0) > 0);
  if (legacyHasExplicitDiscount) return legacy;

  if (pivot.length > 0 && legacy.length === 0) return pivot;

  if (legacy.length > 0) return legacy;

  return pivot;
>>>>>>> c4b5202 (chore: save state before local backup. Fixed sheet detection and DB sync.)
}

function filterByCredor(records: RowRecord[], credorColumn: string | undefined, credorSlug: string): RowRecord[] {
  if (!credorColumn) return [];
  return records.filter((row) => toSlug(row[credorColumn]) === credorSlug);
}

function filterMinimoByCredor(records: MinimoRecord[], credorSlug: string): MinimoRecord[] {
  return records.filter((row) => toSlug(row.credor) === credorSlug);
}

function safeFilePart(value: string): string {
  const sanitized = value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || 'credor';
}

function buildUniqueFolderName(baseDir: string, folderName: string, seen: Map<string, number>): string {
  void baseDir;
  const current = seen.get(folderName) ?? 0;
  if (current === 0) {
    seen.set(folderName, 1);
    return folderName;
  }

  let next = current + 1;
  let candidate = `${folderName} (${next})`;
  while (seen.has(candidate)) {
    next += 1;
    candidate = `${folderName} (${next})`;
  }

  seen.set(folderName, next);
  seen.set(candidate, 1);
  return candidate;
}

function toSheetFromRecords(rows: RowRecord[]): XLSX.WorkSheet {
  const normalizedRows = normalizeCurrencyColumns(rows);
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { skipHeader: false });
  if (normalizedRows.length > 0) {
    applyCurrencyFormatByHeaders(worksheet, Object.keys(normalizedRows[0]));
  }
  return worksheet;
}

function getFirstExistingColumn(headers: string[], patterns: RegExp[]): string | undefined {
  return detectColumn(headers, patterns);
}

function projectRowsByRules(
  rows: RowRecord[],
  headers: string[],
  targetColumns: Array<{ output: string; patterns: RegExp[] }>,
): RowRecord[] {
  if (rows.length === 0) return [];

  const bindings = targetColumns.map((item) => ({
    output: item.output,
    source: getFirstExistingColumn(headers, item.patterns),
  }));

  return rows.map((row) => {
    const projected: RowRecord = {};
    for (const binding of bindings) {
      projected[binding.output] = binding.source ? toDisplayText(row[binding.source]) : '';
    }
    return projected;
  });
}

function toSheetBaseByRules(rows: RowRecord[], headers: string[]): XLSX.WorkSheet {
  const projected = projectRowsByRules(rows, headers, [
    { output: 'Empresa', patterns: [/^empresa$/] },
    { output: 'Credor', patterns: [/^credor$/] },
    { output: 'Documento', patterns: [/^documento$/] },
    { output: 'Cliente', patterns: [/^cliente$/] },
    { output: 'Parcela', patterns: [/^parcela$/] },
    { output: 'Dt. emissão', patterns: [/dt emissao|data emissao/] },
    { output: 'Valor original', patterns: [/valor original/] },
  ]);
  return toSheetFromRecords(projected);
}

function toSheetExtratoByRules(rows: RowRecord[], headers: string[]): XLSX.WorkSheet {
  const projected = projectRowsByRules(rows, headers, [
    { output: 'Empresa', patterns: [/^empresa$/] },
    { output: 'Credor', patterns: [/^credor$/] },
    { output: 'Documento', patterns: [/^documento$/] },
    { output: 'Cliente', patterns: [/^cliente$/] },
    { output: 'Parcela', patterns: [/^parcela$/] },
    { output: 'Dt. emissão', patterns: [/dt emissao|data emissao/] },
    { output: 'Valor original', patterns: [/valor original/] },
    { output: 'Dt. vencimento', patterns: [/dt vencimento|data vencimento/] },
    { output: 'Obs. baixa', patterns: [/obs baixa/] },
  ]);
  return toSheetFromRecords(projected);
}

function toSheetProdutividadeByRules(rows: RowRecord[], headers: string[]): XLSX.WorkSheet {
  const projected = projectRowsByRules(rows, headers, [
    { output: 'Empresa', patterns: [/^empresa$/] },
    { output: 'Credor', patterns: [/^credor$/] },
    { output: 'Documento', patterns: [/^documento$/] },
    { output: 'Cliente', patterns: [/^cliente$/] },
    { output: 'Parcela', patterns: [/^parcela$/] },
    { output: 'Dt. emissão', patterns: [/dt emissao|data emissao/] },
    { output: 'Valor original', patterns: [/valor original/] },
    { output: 'Dt. vencimento', patterns: [/dt vencimento|data vencimento/] },
  ]);
  return toSheetFromRecords(projected);
}

function toSheetFromMinimo(rows: MinimoRecord[]): XLSX.WorkSheet {
  const normalizedRows: SheetRecord[] = rows.map((row) => ({
      CREDOR: row.credor,
      'MINIMO/FIXO': row.minimo,
      'EMPRESA EMISSAO': row.empresa,
      CNPJ: row.cnpj,
      DESCONTO: row.desconto,
      TOTAL: row.total,
    }));
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { skipHeader: false });
  applyCurrencyFormatByHeaders(worksheet, ['CREDOR', 'MINIMO/FIXO', 'EMPRESA EMISSAO', 'CNPJ', 'DESCONTO', 'TOTAL']);
  return worksheet;
}

function toSheetFromDescontos(rows: DiscountLedgerEntry[]): XLSX.WorkSheet {
  const normalizedRows: SheetRecord[] = rows.map((row) => ({
    EMPRESA: row.empresa,
    DESCONTO_ATUAL: row.descontoAtual,
    CARRYOVER_ANTERIOR: row.carryoverAnterior,
    APLICADO_NO_PGC: row.aplicadoNoPgc,
    SALDO_PROXIMO_PGC: row.saldoProximoPgc,
    OBSERVACAO: row.observacao,
  }));

  const worksheet = XLSX.utils.json_to_sheet(
    normalizedRows.length > 0
      ? normalizedRows
      : [
          {
            EMPRESA: '-',
            DESCONTO_ATUAL: 0,
            CARRYOVER_ANTERIOR: 0,
            APLICADO_NO_PGC: 0,
            SALDO_PROXIMO_PGC: 0,
            OBSERVACAO: 'Sem descontos para este credor.',
          },
        ],
  );

  applyCurrencyFormatByHeaders(worksheet, [
    'EMPRESA',
    'DESCONTO_ATUAL',
    'CARRYOVER_ANTERIOR',
    'APLICADO_NO_PGC',
    'SALDO_PROXIMO_PGC',
    'OBSERVACAO',
  ]);

  return worksheet;
}

function buildCredorWorkbook(
  baseRows: RowRecord[],
  baseHeaders: string[],
  minimoRows: MinimoRecord[],
  extratoRows: RowRecord[],
  extratoHeaders: string[],
  produtividadeRows: RowRecord[],
  produtividadeHeaders: string[],
  descontosRows: DiscountLedgerEntry[],
): XLSX.WorkBook {
  void minimoRows;
  void descontosRows;

  const workbook = XLSX.utils.book_new();

  const baseSheet = toSheetBaseByRules(baseRows, baseHeaders);
  XLSX.utils.book_append_sheet(workbook, baseSheet, 'BASE');

  // Keep EXTRATO and PRODUTIVIDADE sheets in the same workbook only when source rows exist.
  if (extratoRows.length > 0) {
    XLSX.utils.book_append_sheet(workbook, toSheetExtratoByRules(extratoRows, extratoHeaders), 'EXTRATO');
  }
  if (produtividadeRows.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      toSheetProdutividadeByRules(produtividadeRows, produtividadeHeaders),
      'PRODUTIVIDADE',
    );
  }

  return workbook;
}

function buildEmissaoWorkbook(
  credorName: string,
  baseRows: RowRecord[],
  baseHeaders: string[],
  companyMap: Map<string, CompanyIdentity>,
  minimoRows: MinimoRecord[],
  descontosRows: DiscountLedgerEntry[],
): XLSX.WorkBook {
  const empresaCol = getFirstExistingColumn(baseHeaders, [/^empresa$/]);
  const valorOriginalCol = getFirstExistingColumn(baseHeaders, [/valor original/]);

  const workbook = XLSX.utils.book_new();
  const consolidatedByEmpresa = new Map<string, SheetRecord>();
  const cnpjByEmpresaFromMinimo = new Map<string, string>();

  for (const row of minimoRows) {
    const empresaKey = normalizeEmpresaKey(row.empresa);
    const cnpj = normalizeDocument(row.cnpj);
    if (!empresaKey || !cnpj) continue;
    if (!cnpjByEmpresaFromMinimo.has(empresaKey)) {
      cnpjByEmpresaFromMinimo.set(empresaKey, cnpj);
    }
  }

  for (const row of baseRows) {
    if (!empresaCol || !valorOriginalCol) continue;

    const empresa = toDisplayText(row[empresaCol]) || '-';
    const identity = resolveCompanyIdentity(empresa, companyMap);
    const resolvedName = identity.fullName || empresa;
    const cnpj = identity.cnpj || cnpjByEmpresaFromMinimo.get(normalizeEmpresaKey(empresa)) || '-';
    
    const valor = parseNumber(row[valorOriginalCol]);
    if (valor === 0) continue;

    const key = `${normalizeEmpresaKey(resolvedName)}::${cnpj}`;
    const current = consolidatedByEmpresa.get(key);

    if (!current) {
      consolidatedByEmpresa.set(key, {
        EMPRESA: resolvedName,
        CREDOR: credorName,
        'CNPJ PARA EMISSAO': cnpj,
        VALOR: Number(valor.toFixed(2)),
      });
      continue;
    }

    const nextValue = Number(((Number(current.VALOR) || 0) + valor).toFixed(2));
    current.VALOR = nextValue;
  }

  // Apply desconto efetivamente usado no PGC por empresa.
  const descontoAplicadoPorEmpresa = new Map<string, number>();
  for (const entry of descontosRows) {
    const empresaKey = normalizeEmpresaKey(entry.empresa);
    if (!empresaKey) continue;
    const aplicado = Number(entry.aplicadoNoPgc ?? 0);
    if (!Number.isFinite(aplicado) || aplicado <= 0) continue;
    descontoAplicadoPorEmpresa.set(
      empresaKey,
      Number(((descontoAplicadoPorEmpresa.get(empresaKey) ?? 0) + aplicado).toFixed(2)),
    );
  }

  for (const current of consolidatedByEmpresa.values()) {
    const empresaKey = normalizeEmpresaKey(current.EMPRESA);
    const descontoEmpresa = descontoAplicadoPorEmpresa.get(empresaKey) ?? 0;
    if (descontoEmpresa <= 0) continue;

    const bruto = Number(current.VALOR) || 0;
    const liquido = Number(Math.max(0, bruto - descontoEmpresa).toFixed(2));
    current.VALOR = liquido;
  }

  const detalhes: SheetRecord[] = Array.from(consolidatedByEmpresa.values()).sort((a, b) =>
    String(a.EMPRESA).localeCompare(String(b.EMPRESA), 'pt-BR', { sensitivity: 'base' }),
  );

  const emissaoSheet = XLSX.utils.json_to_sheet(
    detalhes.length > 0
      ? detalhes
      : [
          {
            EMPRESA: '-',
            CREDOR: credorName,
            'CNPJ PARA EMISSAO': '-',
            VALOR: 0,
          },
        ],
  );
  applyCurrencyFormatByHeaders(emissaoSheet, ['EMPRESA', 'CREDOR', 'CNPJ PARA EMISSAO', 'VALOR']);

  XLSX.utils.book_append_sheet(workbook, emissaoSheet, 'EMISSAO');

  return workbook;
}

function normalizePeriodLabel(raw: string): string {
  const text = toDisplayText(raw).toUpperCase();
  if (!text) return '';

  const monthMap: Record<string, string> = {
    JANEIRO: '01',
    FEVEREIRO: '02',
    MARCO: '03',
    ABRIL: '04',
    MAIO: '05',
    JUNHO: '06',
    JULHO: '07',
    AGOSTO: '08',
    SETEMBRO: '09',
    OUTUBRO: '10',
    NOVEMBRO: '11',
    DEZEMBRO: '12',
  };

  const normalized = normalizeText(text).toUpperCase();
  for (const [name, mm] of Object.entries(monthMap)) {
    if (!normalized.includes(name)) continue;

    const yearMatch = text.match(/(20\d{2}|\d{2})/);
    if (yearMatch) {
      const yy = yearMatch[1].length === 2 ? yearMatch[1] : yearMatch[1].slice(2);
      return `${mm}-${yy}`;
    }
  }

  return text.replace(/\s+/g, '-');
}

function extractProdutividadePeriod(sheetName?: string): string {
  if (!sheetName) return '';
  const clean = toDisplayText(sheetName);
  const withoutPrefix = clean.replace(/^produtividade\s*/i, '').trim();
  return normalizePeriodLabel(withoutPrefix || clean);
}

function resolveFlowOutputDir(flow: string, numeroPgc: string): string {
  const workspaceRoot = resolveWorkspaceRoot();

  if (flow === 'laghetto-sports') {
    return path.join(workspaceRoot, 'PGC', 'SPORTS', numeroPgc);
  }

  if (flow === 'lgm') {
    return path.join(workspaceRoot, 'PGC', 'LGM', numeroPgc);
  }

  return path.join(workspaceRoot, 'PGC', numeroPgc);
}

async function writeZipFromFiles(zipFilePath: string, rootDir: string, filePaths: string[]): Promise<void> {
  const zip = new JSZip();

  for (const filePath of filePaths) {
    const buffer = await fs.readFile(filePath);
    const relative = path.relative(rootDir, filePath).split(path.sep).join('/');
    zip.file(relative, buffer);
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.mkdir(path.dirname(zipFilePath), { recursive: true });
  await fs.writeFile(zipFilePath, content);
}

async function pruneOutputDirForNewRun(outputDir: string, flow: string): Promise<void> {
  // In Sports, output folder is reused by PGC number; remove old credor folders to avoid mixing runs.
  if (flow !== 'laghetto-sports') return;

  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => [] as Array<{ isDirectory: () => boolean; name: string }>);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(outputDir, entry.name);
    await fs.rm(target, { recursive: true, force: true });
  }
}

export function startProcessingWorker(): Worker {
  return new Worker(
    'pgc-processing',
    async (job) => {
      const requestId = String(job.data.requestId);
      const flow = String(job.data.flow ?? 'classic');
      const requestedCredores = ((job.data.credores as string[]) ?? [])
        .map((item) => toDisplayText(item))
        .filter(Boolean);

      if (await shouldStop(requestId)) return;

      await reportProgress(requestId, { stage: 'INGESTION', percent: 10, status: 'PROCESSING' });

      const workbookPath = await withProgressHeartbeat(
        requestId,
        { stage: 'INGESTION', percent: 10 },
        () => resolveInputWorkbook(requestId, flow),
      );
      const workbookFileName = path.basename(workbookPath);
      const workbookBuffer = await withProgressHeartbeat(
        requestId,
        { stage: 'INGESTION', percent: 12 },
        () =>
          withTimeout(
            fs.readFile(workbookPath),
            Number(process.env.INGESTION_TIMEOUT_MS ?? 20_000),
            'INGESTION',
          ),
      );

      const workbook = await withProgressHeartbeat(
        requestId,
        { stage: 'INGESTION', percent: 15 },
        () => Promise.resolve(XLSX.read(workbookBuffer, { type: 'buffer' })),
      );
      const sheetNames = workbook.SheetNames;

<<<<<<< HEAD
      const pgcSheetName = findSheetName(sheetNames, /^PGC/i);
=======
      const isNotRetencao = (name: string) => !normalizeText(name).includes('retencao');

      const pgcSheetName =
        sheetNames.find((n) => /\bpgc\b/.test(normalizeText(n)) && isNotRetencao(n)) ??
        sheetNames.find((n) => /principal|base\s*pgc/.test(normalizeText(n)) && isNotRetencao(n));

>>>>>>> c4b5202 (chore: save state before local backup. Fixed sheet detection and DB sync.)
      if (!pgcSheetName) {
        throw new Error('PGC_SHEET_NOT_FOUND (Aba que inicia com "PGC" nao encontrada)');
      }

<<<<<<< HEAD
      const baseDetailedSheetName = findSheetName(sheetNames, /^BASE\s*PGC/i);
      if (!baseDetailedSheetName) {
        // Fallback para "Base" se for o layout antigo, mas avisar.
        const fallback = findSheetName(sheetNames, /\bbase\b/);
        if (fallback) {
          console.warn(`Usando aba ${fallback} como detalhamento (BASE PGC nao encontrada)`);
        }
      }

      const numeroPgc = extractPgcNumber(pgcSheetName, workbookFileName);
      const baseSheetName = baseDetailedSheetName || findSheetName(sheetNames, /\bbase\b/);
      
=======
      const baseSheetName = sheetNames.find((n) => /\bbase\b/.test(normalizeText(n)) && isNotRetencao(n));
>>>>>>> c4b5202 (chore: save state before local backup. Fixed sheet detection and DB sync.)
      if (!baseSheetName) {
        throw new Error('DETAILED_BASE_SHEET_NOT_FOUND (Aba BASE PGC nao encontrada)');
      }

      const extratoSheetName = findSheetName(sheetNames, /\bextrato\b/);
      const produtividadeSheetName = findSheetName(sheetNames, /produtividade|\bprod\b/);
      const produtividadePeriod = extractProdutividadePeriod(produtividadeSheetName);

      if (!extratoSheetName) {
        await reportProgress(requestId, {
          stage: 'INGESTION',
          percent: 12,
          appendError: {
            code: 'OPTIONAL_EXTRATO_MISSING',
            message: 'Aba EXTRATO nao encontrada; processamento continuara sem ela.',
          },
        });
      }

      if (!produtividadeSheetName) {
        await reportProgress(requestId, {
          stage: 'INGESTION',
          percent: 14,
          appendError: {
            code: 'OPTIONAL_PRODUTIVIDADE_MISSING',
            message: 'Aba PRODUTIVIDADE nao encontrada; processamento continuara sem ela.',
          },
        });
      }
      const baseSheet = parseTabularSheet(workbook.Sheets[baseSheetName]);
      const extratoSheet = extratoSheetName
        ? parseTabularSheet(workbook.Sheets[extratoSheetName])
        : { records: [], headers: [] };
      const produtividadeSheet = produtividadeSheetName
        ? parseTabularSheet(workbook.Sheets[produtividadeSheetName])
        : { records: [], headers: [] };

      if (!baseSheet.credorColumn) {
        throw new Error('BASE_CREDOR_COLUMN_NOT_FOUND');
      }

      if (await shouldStop(requestId)) return;

      await reportProgress(requestId, { stage: 'MINIMO', percent: 30, status: 'PROCESSING' });

      const cnpjFallback = buildCnpjFallbackMap(baseSheet);
      const companyMap = await loadEmpresaCnpjMap(path.dirname(workbookPath));
      const minimoRecords = await withProgressHeartbeat(
        requestId,
        { stage: 'MINIMO', percent: 30 },
        () =>
          withTimeout(
            Promise.resolve(deriveMinimoRecords(workbook.Sheets[pgcSheetName], cnpjFallback, companyMap)),
            Number(process.env.MINIMO_TIMEOUT_MS ?? 20_000),
            'MINIMO',
          ),
      );

          const discountHistoryState = await loadDiscountHistoryState(flow);

      const baseValorColumn = detectColumn(baseSheet.headers, [
        /valor\s*original/,
        /^valor$/,
        /total\s*geral/,
      ]);
      const basePeriodoColumn = detectColumn(baseSheet.headers, [
        /mes\s*venda/,
        /mes\s*prev\s*pagamento/,
        /periodo/,
        /referencia/,
      ]);

      if (await shouldStop(requestId)) return;

      await reportProgress(requestId, { stage: 'DESCONTOS', percent: 50, status: 'PROCESSING' });

      const discoveredCredores = new Map<string, string>();
      for (const row of minimoRecords) {
        const slug = toSlug(row.credor);
        if (!slug) continue;
        if (!discoveredCredores.has(slug)) {
          discoveredCredores.set(slug, row.credor);
        }
      }

      const targetCredores = requestedCredores.length
        ? requestedCredores.map((item) => ({ slug: toSlug(item), label: item }))
        : Array.from(discoveredCredores.entries()).map(([slug, label]) => ({ slug, label }));

      const filteredCredores = targetCredores.filter((item) => item.slug);
      filteredCredores.sort((a, b) =>
        (a.label || a.slug).localeCompare(b.label || b.slug, 'pt-BR', { sensitivity: 'base' }),
      );
      if (filteredCredores.length === 0) {
        throw new Error('NO_CREDORES_TO_PROCESS');
      }

      const outputDir = resolveFlowOutputDir(flow, numeroPgc);
      await fs.mkdir(outputDir, { recursive: true });
      await pruneOutputDirForNewRun(outputDir, flow);

      // Persiste MINIMO.xlsx para uso posterior pelo serviço de e-mails.
      if (minimoRecords.length > 0) {
        const minimoWb = XLSX.utils.book_new();
        const minimoData = minimoRecords.map((r) => ({
          CREDOR: r.credor,
          'MINIMO/FIXO': r.minimo,
          'EMPRESA EMISSAO': r.empresa,
          CNPJ: r.cnpj,
          DESCONTO: r.desconto ?? 0,
          TOTAL: r.total ?? r.minimo,
          DESCRICAO: r.descricao || 'Mínimo garantido',
        }));
        const minimoWs = XLSX.utils.json_to_sheet(minimoData);
        XLSX.utils.book_append_sheet(minimoWb, minimoWs, 'MINIMO');
        const minimoOutPath = path.join(outputDir, 'MINIMO.xlsx');
        XLSX.writeFile(minimoWb, minimoOutPath);
        console.log(`MINIMO.xlsx salvo em ${minimoOutPath} (${minimoRecords.length} registros)`);
      }

      const createdFiles: string[] = [];
      const folderNameOccurrences = new Map<string, number>();

      let successCount = 0;
      let errorCount = 0;

      for (let index = 0; index < filteredCredores.length; index += 1) {
        await yieldToEventLoop();

        const credorSlug = filteredCredores[index].slug;
        const credorName =
          discoveredCredores.get(credorSlug) || toCredorDisplayName(filteredCredores[index].label) || credorSlug;

        if (await shouldStop(requestId)) return;

        const dynamicPercent = 55 + Math.floor((index / filteredCredores.length) * 35);

        await reportProgress(requestId, {
          stage: 'CREDOR_LOOP',
          percent: dynamicPercent,
          currentCredor: credorSlug,
          credorUpdate: { credorSlug, state: 'PROCESSING' },
        });

        try {
          const baseRows = filterByCredor(baseSheet.records, baseSheet.credorColumn, credorSlug);
          const extratoRows = filterByCredor(extratoSheet.records, extratoSheet.credorColumn, credorSlug);
          const produtividadeRows = filterByCredor(
            produtividadeSheet.records,
            produtividadeSheet.credorColumn,
            credorSlug,
          );
          const minimoRowsRaw = filterMinimoByCredor(minimoRecords, credorSlug);
          const { adjustedRows: minimoRows, ledger: descontosRows } = applyDiscountsForCredor(
            credorSlug,
            minimoRowsRaw,
            discountHistoryState,
            baseRows,
            baseSheet.headers,
            companyMap,
          );

          await appendDiscountHistoryLog(
            flow,
            descontosRows.map((entry) => ({
              createdAt: new Date().toISOString(),
              requestId,
              numeroPgc,
              credorSlug,
              credorName,
              empresa: entry.empresa,
              descontoAtual: Number(entry.descontoAtual.toFixed(2)),
              carryoverAnterior: Number(entry.carryoverAnterior.toFixed(2)),
              aplicadoNoPgc: Number(entry.aplicadoNoPgc.toFixed(2)),
              saldoProximoPgc: Number(entry.saldoProximoPgc.toFixed(2)),
            })),
          );

          // Cálculo do Valor Líquido para o Dashboard (Bruto + Mínimo - Descontos Efetivamente Aplicados)
          const brutoEPgcMinimo = minimoRows.reduce((acc, row) => acc + (row.total || 0), 0);
          const totalDescontosAplicados = descontosRows.reduce((acc, row) => acc + (row.aplicadoNoPgc || 0), 0);
          const valorTotalCredor = Number((brutoEPgcMinimo - totalDescontosAplicados).toFixed(2));
          
          // Debug para auditoria da Ludmilla e Clemar
          if (credorSlug === 'clemar-de-souza' || credorSlug === 'ludmilla-rosa-moreira-de-souza') {
            console.log(`[DEBUG FINANCEIRO] Credor: ${credorSlug}, Bruto(AL): ${brutoEPgcMinimo - totalDescontosAplicados}, Mínimo(AO): ${minimoRows.reduce((a,r)=>a+r.minimo,0)}, Net Dashboard: ${valorTotalCredor}`);
          }

          const periodoFromBase =
            basePeriodoColumn && baseRows.length > 0
              ? toDisplayText(
                  baseRows.find((row) => toDisplayText(row[basePeriodoColumn] ?? '') !== '')?.[basePeriodoColumn] ??
                    '',
                )
              : '';
          const periodoCredor =
            periodoFromBase ||
            `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;
          const produtividadeMissingWarning =
            produtividadeRows.length === 0
              ? 'Arquivo de produtividade nao gerado para este credor (sem linhas na aba PRODUTIVIDADE).'
              : undefined;

          if (
            baseRows.length === 0 &&
            extratoRows.length === 0 &&
            produtividadeRows.length === 0 &&
            minimoRows.length === 0
          ) {
            throw new Error('CREDOR_NO_DATA');
          }

          await withProgressHeartbeat(
            requestId,
            { stage: 'CREDOR_LOOP', percent: dynamicPercent, currentCredor: credorSlug },
            () =>
              withTimeout(
                Promise.resolve().then(() => {
                  const safeCredor = safeFilePart(credorName);
                  const folderName = buildUniqueFolderName(outputDir, safeCredor, folderNameOccurrences);
                  const credorDir = path.join(outputDir, folderName);
                  const baseName = `${safeCredor} - PGC ${numeroPgc}`;
                  return fs.mkdir(credorDir, { recursive: true }).then(() => {

                    const credorWorkbook = buildCredorWorkbook(
                      baseRows,
                      baseSheet.headers,
                      minimoRows,
                      extratoRows,
                      extratoSheet.headers,
                      produtividadeRows,
                      produtividadeSheet.headers,
                      descontosRows,
                    );
                    const credorFile = path.join(credorDir, `${baseName}.xlsx`);
                    XLSX.writeFile(credorWorkbook, credorFile, { bookType: 'xlsx' });
                    createdFiles.push(credorFile);

                    const emissaoWorkbook = buildEmissaoWorkbook(
                      credorName,
                      baseRows,
                      baseSheet.headers,
                      companyMap,
                      minimoRows,
                      descontosRows,
                    );
                    const emissaoFile = path.join(credorDir, `${baseName} EMISSAO.xlsx`);
                    XLSX.writeFile(emissaoWorkbook, emissaoFile, { bookType: 'xlsx' });
                    createdFiles.push(emissaoFile);

                    if (extratoRows.length > 0) {
                      const extratoBook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(
                        extratoBook,
                        toSheetExtratoByRules(extratoRows, extratoSheet.headers),
                        'EXTRATO',
                      );
                      const extratoFile = path.join(credorDir, `${baseName} EXTRATO.xlsx`);
                      XLSX.writeFile(extratoBook, extratoFile, { bookType: 'xlsx' });
                      createdFiles.push(extratoFile);
                    }

                    if (produtividadeRows.length > 0) {
                      const prodBook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(
                        prodBook,
                        toSheetProdutividadeByRules(produtividadeRows, produtividadeSheet.headers),
                        'PRODUTIVIDADE',
                      );
                      const prodSuffix = produtividadePeriod ? ` ${produtividadePeriod}` : '';
                      const prodFile = path.join(credorDir, `${baseName} PRODUTIVIDADE${prodSuffix}.xlsx`);
                      XLSX.writeFile(prodBook, prodFile, { bookType: 'xlsx' });
                      createdFiles.push(prodFile);
                    }
                  });
                }),
                Number(process.env.CREDOR_TIMEOUT_MS ?? 30_000),
                `CREDOR_${credorSlug}`,
              ),
          );

          successCount += 1;
          await reportProgress(requestId, {
            stage: 'CREDOR_LOOP',
            percent: Math.min(92, dynamicPercent + 2),
            successCount,
            credorUpdate: {
              credorSlug,
              state: 'SUCCESS',
              credorName,
              numeroPgc,
              periodo: periodoCredor,
              valorTotal: Number(valorTotalCredor.toFixed(2)),
              flow,
              warning: produtividadeMissingWarning,
            },
          });
        } catch (error) {
          errorCount += 1;
          const message = (error as Error).message;
          const code = message.includes('TIMEOUT')
            ? 'CREDOR_TIMEOUT_ERROR'
            : message === 'CREDOR_NO_DATA'
              ? 'CREDOR_NO_DATA'
              : 'CREDOR_PROCESSING_ERROR';

          await reportProgress(requestId, {
            stage: 'CREDOR_LOOP',
            percent: Math.min(92, dynamicPercent + 2),
            errorCount,
            credorUpdate: { credorSlug, state: 'ERROR' },
            appendError: {
              credorSlug,
              code,
              message:
                code === 'CREDOR_NO_DATA'
                  ? 'Credor sem dados nas abas disponiveis; processamento seguiu para os demais.'
                  : 'Falha isolada de credor sem interromper job global',
            },
          });
        }

        await yieldToEventLoop();
      }

      await persistDiscountHistoryState(flow, discountHistoryState);

      if (await shouldStop(requestId)) return;

      if (createdFiles.length === 0) {
        throw new Error('NO_OUTPUT_FILES_CREATED');
      }

      const workspaceRoot = resolveWorkspaceRoot();
      const zipRelativePath = `requests/${requestId}/outputs.zip`;
      const zipAbsolutePath = path.join(workspaceRoot, ...zipRelativePath.split('/'));

      await withProgressHeartbeat(
        requestId,
        { stage: 'ARTIFACTS', percent: 93 },
        () =>
          withTimeout(
            writeZipFromFiles(zipAbsolutePath, outputDir, createdFiles),
            Number(process.env.ARTIFACTS_TIMEOUT_MS ?? 180_000),
            'ARTIFACTS',
          ),
      );

      await reportProgress(requestId, {
        stage: 'ARTIFACTS',
        percent: 95,
        appendArtifact: { type: 'ZIP', path: zipRelativePath },
      });

      if (await shouldStop(requestId)) return;

      await reportProgress(requestId, {
        stage: 'FINISHED',
        percent: 100,
        status: errorCount > 0 ? 'ERROR' : 'SUCCESS',
        successCount,
        errorCount,
        expectedCredores: filteredCredores.map((item) => item.slug),
      });
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      concurrency: Number(process.env.PGC_WORKER_CONCURRENCY ?? 1),
      lockDuration: Number(process.env.PGC_WORKER_LOCK_DURATION_MS ?? 600_000),
      stalledInterval: Number(process.env.PGC_WORKER_STALLED_INTERVAL_MS ?? 30_000),
      maxStalledCount: Number(process.env.PGC_WORKER_MAX_STALLED_COUNT ?? 5),
    },
  );
}

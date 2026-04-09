export function normalizeEmpresaKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim();
}

export function resolveCnpjForEmpresa(empresa: string, empresaCnpjMap: Map<string, string>): string {
  const key = normalizeEmpresaKey(empresa);
  return empresaCnpjMap.get(key) || '';
}

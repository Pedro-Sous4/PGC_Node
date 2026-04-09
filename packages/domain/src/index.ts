export interface CanonicalName {
  displayName: string;
  canonicalName: string;
}

const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function toTitleCaseName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((chunk, index) => {
      const low = chunk.toLowerCase();
      if (index > 0 && PREPOSICOES.has(low)) {
        return low;
      }

      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join(' ');
}

export function toCanonicalName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeName(input: string): CanonicalName {
  const displayName = toTitleCaseName(input);
  const canonicalName = toCanonicalName(displayName);

  return { displayName, canonicalName };
}

export * from './validators';

export function isValidCredorName(nome: string): boolean {
  const trimmed = nome.trim();
  return trimmed.length >= 3 && trimmed.length <= 180;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidRendimentoValor(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0;
}

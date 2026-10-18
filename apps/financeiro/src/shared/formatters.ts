export function formatBRL(value: number | undefined | null): string {
  const num = Number(value || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPct(value: number | undefined | null): string {
  const num = Number(value || 0);
  return `${num.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

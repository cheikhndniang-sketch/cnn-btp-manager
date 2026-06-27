export function formatFCFA(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(value) + ' FCFA';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

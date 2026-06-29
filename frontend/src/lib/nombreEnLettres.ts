const UNITS = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];

function belowHundred(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7) return u === 1 ? 'soixante-et-onze' : `soixante-${UNITS[10 + u]}`;
  if (t === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITS[u]}`;
  if (t === 9) return `quatre-vingt-${UNITS[10 + u]}`;
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][t];
  const link = u === 1 ? '-et-un' : u > 0 ? `-${UNITS[u]}` : '';
  return tens + link;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return belowHundred(rest);
  const centPart = h === 1 ? 'cent' : `${UNITS[h]} cent${rest === 0 ? 's' : ''}`;
  return rest === 0 ? centPart : `${centPart} ${belowHundred(rest)}`;
}

/** Convertit un montant entier en toutes lettres françaises (FCFA). */
export function montantEnLettres(amount: number): string {
  if (!isFinite(amount) || amount < 0) return '';
  let n = Math.round(amount);
  if (n === 0) return 'zéro franc CFA';

  const parts: string[] = [];

  if (n >= 1_000_000_000) {
    const b = Math.floor(n / 1_000_000_000);
    parts.push(`${belowThousand(b)} milliard${b > 1 ? 's' : ''}`);
    n %= 1_000_000_000;
  }
  if (n >= 1_000_000) {
    const m = Math.floor(n / 1_000_000);
    parts.push(`${belowThousand(m)} million${m > 1 ? 's' : ''}`);
    n %= 1_000_000;
  }
  if (n >= 1_000) {
    const k = Math.floor(n / 1_000);
    parts.push(k === 1 ? 'mille' : `${belowThousand(k)} mille`);
    n %= 1_000;
  }
  if (n > 0) parts.push(belowThousand(n));

  return `${parts.join(' ')} franc${Math.round(amount) > 1 ? 's' : ''} CFA`;
}

/** Version MAJUSCULES pour les documents officiels. */
export function montantEnLettresMaj(amount: number): string {
  return montantEnLettres(amount).toUpperCase();
}

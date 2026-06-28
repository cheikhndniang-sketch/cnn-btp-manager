import { lotProgress, siteProgress } from './progress.util';

describe('progress.util', () => {
  it('un lot sans tâche vaut 0 %', () => {
    expect(lotProgress([])).toBe(0);
  });

  it('moyenne simple des tâches (poids égaux)', () => {
    expect(
      lotProgress([
        { progressPct: 100, weight: 1 },
        { progressPct: 0, weight: 1 },
      ]),
    ).toBe(50);
  });

  it('moyenne pondérée des tâches', () => {
    // (3*100 + 1*0) / 4 = 75
    expect(
      lotProgress([
        { progressPct: 100, weight: 3 },
        { progressPct: 0, weight: 1 },
      ]),
    ).toBe(75);
  });

  it('borne les pourcentages hors limites', () => {
    expect(
      lotProgress([
        { progressPct: 150, weight: 1 },
        { progressPct: -20, weight: 1 },
      ]),
    ).toBe(50); // 100 et 0
  });

  it('avancement chantier = moyenne pondérée des lots', () => {
    const lots = [
      { weight: 2, tasks: [{ progressPct: 100, weight: 1 }] }, // lot à 100
      { weight: 1, tasks: [{ progressPct: 40, weight: 1 }] }, // lot à 40
    ];
    // (2*100 + 1*40) / 3 = 80
    expect(siteProgress(lots)).toBe(80);
  });

  it('un chantier sans lot vaut 0 %', () => {
    expect(siteProgress([])).toBe(0);
  });

  it('un lot sans tâche compte pour 0 dans le chantier', () => {
    const lots = [
      { weight: 1, tasks: [{ progressPct: 100, weight: 1 }] },
      { weight: 1, tasks: [] },
    ];
    expect(siteProgress(lots)).toBe(50);
  });
});

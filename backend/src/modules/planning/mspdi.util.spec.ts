import { buildMspdi } from './mspdi.util';

describe('buildMspdi', () => {
  const xml = buildMspdi(
    { name: 'Marché Sandaga', reference: 'SAN-2024-001' },
    [
      {
        code: 'L01',
        name: 'GROS OEUVRE',
        progressPct: 50,
        tasks: [
          {
            name: 'Fondations',
            progressPct: 100,
            startDate: new Date('2026-02-16'),
            endDate: new Date('2026-02-20'),
          },
          {
            name: 'Élévation & dépendances <test>',
            progressPct: 0,
            startDate: new Date('2026-02-23'),
            endDate: new Date('2026-03-06'),
          },
        ],
      },
    ],
  );

  it('produit un en-tête MSPDI valide avec calendrier Standard', () => {
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect(xml).toContain('<Name>Standard</Name>');
    expect(xml).toContain('<CalendarUID>1</CalendarUID>');
  });

  it('génère 1 récap (lot) + 2 tâches = 3 Task', () => {
    expect((xml.match(/<Task>/g) ?? []).length).toBe(3);
  });

  it('le lot est un récapitulatif (Summary=1, niveau 1)', () => {
    expect(xml).toContain('<Name>L01 · GROS OEUVRE</Name>');
    expect(xml).toContain('<Summary>1</Summary>');
  });

  it('les tâches feuilles portent contrainte SNET + PercentComplete', () => {
    expect(xml).toContain('<ConstraintType>4</ConstraintType>');
    expect(xml).toContain('<PercentComplete>100</PercentComplete>');
  });

  it('échappe les caractères XML', () => {
    expect(xml).toContain('Élévation &amp; dépendances &lt;test&gt;');
  });
});

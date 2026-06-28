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
            id: 'task-a',
            name: 'Fondations',
            progressPct: 100,
            startDate: new Date('2026-02-16'),
            endDate: new Date('2026-02-20'),
            predecessors: [],
          },
          {
            id: 'task-b',
            name: 'Élévation & dépendances <test>',
            progressPct: 0,
            startDate: new Date('2026-02-23'),
            endDate: new Date('2026-03-06'),
            predecessors: [{ predecessorId: 'task-a', type: 'FS', lagDays: 2 }],
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

  it('une tâche sans prédécesseur est ancrée (SNET) avec PercentComplete', () => {
    expect(xml).toContain('<ConstraintType>4</ConstraintType>');
    expect(xml).toContain('<PercentComplete>100</PercentComplete>');
  });

  it('une tâche avec prédécesseur passe en ASAP et émet un PredecessorLink', () => {
    expect(xml).toContain('<ConstraintType>0</ConstraintType>');
    expect(xml).toContain('<PredecessorLink>');
    expect(xml).toContain('<Type>1</Type>'); // FS
    // lag 2 jours -> 2 * 480 * 10 = 9600 dixièmes de minute
    expect(xml).toContain('<LinkLag>9600</LinkLag>');
    expect(xml).toContain('<LagFormat>7</LagFormat>');
  });

  it('échappe les caractères XML', () => {
    expect(xml).toContain('Élévation &amp; dépendances &lt;test&gt;');
  });
});

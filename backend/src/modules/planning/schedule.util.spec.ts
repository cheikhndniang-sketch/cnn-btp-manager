import {
  countLate,
  plannedProgress,
  sitePlannedProgress,
  taskLateness,
} from './schedule.util';

const d = (s: string) => new Date(s);

describe('schedule.util', () => {
  describe('plannedProgress', () => {
    it('0 % avant le début', () => {
      expect(plannedProgress(d('2026-06-01'), d('2026-06-11'), d('2026-05-20'))).toBe(0);
    });
    it('100 % après la fin', () => {
      expect(plannedProgress(d('2026-06-01'), d('2026-06-11'), d('2026-07-01'))).toBe(100);
    });
    it('50 % à mi-parcours', () => {
      expect(plannedProgress(d('2026-06-01'), d('2026-06-11'), d('2026-06-06'))).toBe(50);
    });
    it('0 % si dates manquantes', () => {
      expect(plannedProgress(null, d('2026-06-11'), d('2026-06-06'))).toBe(0);
    });
  });

  describe('taskLateness', () => {
    it('en retard : non terminée + fin dépassée', () => {
      const r = taskLateness(d('2026-06-01'), 40, d('2026-06-11'));
      expect(r.enRetard).toBe(true);
      expect(r.retardJours).toBe(10);
    });
    it("pas en retard si terminée (100%) même fin dépassée", () => {
      expect(taskLateness(d('2026-06-01'), 100, d('2026-06-11')).enRetard).toBe(false);
    });
    it('pas en retard si fin pas encore atteinte', () => {
      expect(taskLateness(d('2026-12-31'), 0, d('2026-06-11')).enRetard).toBe(false);
    });
  });

  describe('countLate', () => {
    it('compte les tâches en retard et le retard max', () => {
      const lots = [
        {
          weight: 1,
          tasks: [
            { progressPct: 0, weight: 1, startDate: d('2026-05-01'), endDate: d('2026-06-01') }, // retard 10j
            { progressPct: 100, weight: 1, startDate: d('2026-05-01'), endDate: d('2026-05-15') }, // terminée
            { progressPct: 20, weight: 1, startDate: d('2026-05-01'), endDate: d('2026-06-08') }, // retard 3j
          ],
        },
      ];
      const stats = countLate(lots, d('2026-06-11'));
      expect(stats.tasksTotal).toBe(3);
      expect(stats.tasksLate).toBe(2);
      expect(stats.retardMaxJours).toBe(10);
    });
  });

  it('sitePlannedProgress agrège les lots (pondéré)', () => {
    const asOf = d('2026-06-06');
    const lots = [
      { weight: 1, tasks: [{ progressPct: 0, weight: 1, startDate: d('2026-06-01'), endDate: d('2026-06-11') }] },
    ];
    expect(sitePlannedProgress(lots, asOf)).toBe(50);
  });
});

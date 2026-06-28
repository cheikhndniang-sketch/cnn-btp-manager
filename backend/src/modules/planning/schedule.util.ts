/**
 * Calculs d'échéancier (purs) : avancement *planifié* à une date, et retard constaté.
 *
 * Le retard est calculé par rapport à la **date de fin planifiée** (pas de baseline MS Project) :
 * une tâche non terminée dont la fin prévue est dépassée est « en retard ».
 */

export interface ScheduledTask {
  progressPct: number;
  weight: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface ScheduledLot {
  weight: number;
  tasks: ScheduledTask[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Avancement théorique d'une tâche à la date `asOf` (interpolation linéaire start→end). */
export function plannedProgress(
  start: Date | null,
  end: Date | null,
  asOf: Date,
): number {
  if (!start || !end) return 0;
  const s = start.getTime();
  const e = end.getTime();
  const t = asOf.getTime();
  if (t <= s) return 0;
  if (e <= s || t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 100);
}

/** Retard d'une tâche : non terminée + fin prévue dépassée. */
export function taskLateness(
  end: Date | null,
  progressPct: number,
  asOf: Date,
): { enRetard: boolean; retardJours: number } {
  if (progressPct >= 100 || !end) {
    return { enRetard: false, retardJours: 0 };
  }
  const days = Math.floor((asOf.getTime() - end.getTime()) / DAY_MS);
  return days > 0 ? { enRetard: true, retardJours: days } : { enRetard: false, retardJours: 0 };
}

function weightedAverage(items: Array<{ weight: number; value: number }>): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((s, i) => s + (i.weight > 0 ? i.weight : 1), 0);
  if (totalWeight === 0) return 0;
  const sum = items.reduce((acc, i) => acc + (i.weight > 0 ? i.weight : 1) * i.value, 0);
  return Math.round(sum / totalWeight);
}

export function lotPlannedProgress(tasks: ScheduledTask[], asOf: Date): number {
  return weightedAverage(
    tasks.map((t) => ({
      weight: t.weight,
      value: plannedProgress(t.startDate, t.endDate, asOf),
    })),
  );
}

export function sitePlannedProgress(lots: ScheduledLot[], asOf: Date): number {
  return weightedAverage(
    lots.map((l) => ({ weight: l.weight, value: lotPlannedProgress(l.tasks, asOf) })),
  );
}

export interface LateStats {
  tasksTotal: number;
  tasksLate: number;
  retardMaxJours: number;
}

export function countLate(lots: ScheduledLot[], asOf: Date): LateStats {
  let tasksTotal = 0;
  let tasksLate = 0;
  let retardMaxJours = 0;
  for (const lot of lots) {
    for (const task of lot.tasks) {
      tasksTotal++;
      const { enRetard, retardJours } = taskLateness(task.endDate, task.progressPct, asOf);
      if (enRetard) {
        tasksLate++;
        if (retardJours > retardMaxJours) retardMaxJours = retardJours;
      }
    }
  }
  return { tasksTotal, tasksLate, retardMaxJours };
}

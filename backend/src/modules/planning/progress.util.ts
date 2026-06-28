/**
 * Calcul d'avancement (pur, sans dépendance) — réutilisé par le Planning et les KPI chantier.
 *
 * - Avancement d'un lot   = moyenne des % de ses tâches, pondérée par `weight`.
 * - Avancement d'un chantier = moyenne des avancements de ses lots, pondérée par `weight`.
 * Un lot sans tâche compte pour 0 %. Un chantier sans lot vaut 0 %.
 */

export interface TaskLike {
  progressPct: number;
  weight: number;
}

export interface LotLike {
  weight: number;
  tasks: TaskLike[];
}

function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function weightedAverage(items: Array<{ weight: number; value: number }>): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((sum, i) => sum + (i.weight > 0 ? i.weight : 1), 0);
  if (totalWeight === 0) return 0;
  const sum = items.reduce(
    (acc, i) => acc + (i.weight > 0 ? i.weight : 1) * clampPct(i.value),
    0,
  );
  return Math.round(sum / totalWeight);
}

export function lotProgress(tasks: TaskLike[]): number {
  return weightedAverage(
    tasks.map((t) => ({ weight: t.weight, value: t.progressPct })),
  );
}

export function siteProgress(lots: LotLike[]): number {
  return weightedAverage(
    lots.map((l) => ({ weight: l.weight, value: lotProgress(l.tasks) })),
  );
}

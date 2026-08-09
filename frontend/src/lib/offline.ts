import type { QueryClient } from '@tanstack/react-query';
import { effectifApi, planningApi, type TaskPayload, type UpsertPointagePayload } from '@/api/endpoints';
import type { Lot, Pointage } from '@/api/types';

// ── Saisie terrain hors-ligne (cf. mémoire XVI.4.1) ───────────────────
// Les pointages saisis sans réseau sont mis en file d'attente (persistée
// dans localStorage) puis rejoués automatiquement au retour de la
// connexion. Les mutations portent une clé + une fonction par défaut afin
// d'être « résumables » même après fermeture/réouverture de l'application.

export const MUT_POINTAGE_UPSERT = ['pointage-upsert'] as const;
export const MUT_POINTAGE_DELETE = ['pointage-delete'] as const;
export const MUT_TASK_UPDATE = ['task-update'] as const;

export interface TaskUpdateVars {
  siteId: string;
  lotId: string;
  taskId: string;
  payload: TaskPayload;
}

export interface PointageUpsertVars {
  siteId: string;
  mois: string;
  payload: UpsertPointagePayload;
}

export interface PointageDeleteVars {
  siteId: string;
  mois: string;
  id: string;
  ouvrierId: string;
  date: string; // YYYY-MM-DD
}

function pointagesKey(siteId: string, mois: string) {
  return ['effectif-pointages', siteId, mois] as const;
}

function sameDay(p: Pointage, ouvrierId: string, date: string) {
  return p.ouvrierId === ouvrierId && p.date.slice(0, 10) === date;
}

export function registerOfflineMutationDefaults(qc: QueryClient): void {
  // ── Upsert pointage ────────────────────────────────────────────────
  qc.setMutationDefaults(MUT_POINTAGE_UPSERT, {
    mutationFn: ({ siteId, payload }: PointageUpsertVars) =>
      effectifApi.upsertPointage(siteId, payload),
    onMutate: async ({ siteId, mois, payload }: PointageUpsertVars) => {
      const key = pointagesKey(siteId, mois);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Pointage[]>(key);
      qc.setQueryData<Pointage[]>(key, (old = []) => {
        const existing = old.find((p) => sameDay(p, payload.ouvrierId, payload.date));
        const others = old.filter((p) => !sameDay(p, payload.ouvrierId, payload.date));
        const optimistic: Pointage = {
          id: existing?.id ?? `offline-${payload.ouvrierId}-${payload.date}`,
          ouvrierId: payload.ouvrierId,
          siteId,
          date: payload.date,
          present: payload.present ?? true,
          heures: payload.heures ?? 8,
          heuresNuit: payload.heuresNuit ?? 0,
          jourFerie: payload.jourFerie ?? false,
          notes: payload.notes ?? null,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          ouvrier:
            existing?.ouvrier ?? {
              id: payload.ouvrierId,
              nom: '',
              prenom: null,
              fonction: null,
              matricule: null,
            },
        };
        return [...others, optimistic];
      });
      return { prev, key };
    },
    onError: (_e, _vars, ctx) => {
      const c = ctx as { prev?: Pointage[]; key?: readonly unknown[] } | undefined;
      if (c?.key && c.prev) qc.setQueryData(c.key as unknown[], c.prev);
    },
    onSettled: (_d, _e, vars: PointageUpsertVars) => {
      void qc.invalidateQueries({ queryKey: pointagesKey(vars.siteId, vars.mois) });
      void qc.invalidateQueries({ queryKey: ['effectif-resume', vars.siteId] });
    },
  });

  // ── Suppression pointage ───────────────────────────────────────────
  qc.setMutationDefaults(MUT_POINTAGE_DELETE, {
    // Un pointage encore optimiste (jamais synchronisé) n'existe pas côté
    // serveur : on le retire seulement du cache local, sans appel réseau.
    mutationFn: ({ siteId, id }: PointageDeleteVars) =>
      id.startsWith('offline-')
        ? Promise.resolve({ ok: true })
        : effectifApi.deletePointage(siteId, id),
    onMutate: async ({ siteId, mois, ouvrierId, date }: PointageDeleteVars) => {
      const key = pointagesKey(siteId, mois);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Pointage[]>(key);
      qc.setQueryData<Pointage[]>(key, (old = []) =>
        old.filter((p) => !sameDay(p, ouvrierId, date)),
      );
      return { prev, key };
    },
    onError: (_e, _vars, ctx) => {
      const c = ctx as { prev?: Pointage[]; key?: readonly unknown[] } | undefined;
      if (c?.key && c.prev) qc.setQueryData(c.key as unknown[], c.prev);
    },
    onSettled: (_d, _e, vars: PointageDeleteVars) => {
      void qc.invalidateQueries({ queryKey: pointagesKey(vars.siteId, vars.mois) });
      void qc.invalidateQueries({ queryKey: ['effectif-resume', vars.siteId] });
    },
  });

  // ── Avancement de tâche (planning) ─────────────────────────────────
  qc.setMutationDefaults(MUT_TASK_UPDATE, {
    mutationFn: ({ siteId, lotId, taskId, payload }: TaskUpdateVars) =>
      planningApi.updateTask(siteId, lotId, taskId, payload),
    onMutate: async ({ siteId, lotId, taskId, payload }: TaskUpdateVars) => {
      const key = ['planning', siteId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Lot[]>(key);
      qc.setQueryData<Lot[]>(key, (old = []) =>
        old.map((lot) => {
          if (lot.id !== lotId) return lot;
          const tasks = lot.tasks.map((t) =>
            t.id === taskId ? { ...t, ...payload } : t,
          );
          const totW = tasks.reduce((a, t) => a + (t.weight || 1), 0) || tasks.length || 1;
          const progressPct = Math.round(
            tasks.reduce((a, t) => a + (t.weight || 1) * (t.progressPct ?? 0), 0) / totW,
          );
          return { ...lot, tasks, progressPct };
        }),
      );
      return { prev, key };
    },
    onError: (_e, _vars, ctx) => {
      const c = ctx as { prev?: Lot[]; key?: readonly unknown[] } | undefined;
      if (c?.key && c.prev) qc.setQueryData(c.key as unknown[], c.prev);
    },
    onSettled: (_d, _e, vars: TaskUpdateVars) => {
      void qc.invalidateQueries({ queryKey: ['planning', vars.siteId] });
      void qc.invalidateQueries({ queryKey: ['site', vars.siteId, 'kpi'] });
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planningApi, type TaskPayload } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import {
  TASK_STATUS_LABELS,
  type Lot,
  type Role,
  type Task,
  type TaskStatus,
} from '@/api/types';

const ROLE_LEVEL: Record<Role, number> = {
  ADMIN: 4,
  DIRECTEUR_PROJET: 3,
  DIRECTEUR_TRAVAUX: 2,
  CONDUCTEUR_TRAVAUX: 1,
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-orange-light text-orange',
  DONE: 'bg-green-light text-green',
  BLOCKED: 'bg-red-light text-red',
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div
        className="h-2 rounded-full bg-cyan transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function PlanningTab({
  siteId,
  siteName,
  siteReference,
}: {
  siteId: string;
  siteName: string;
  siteReference: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManageLots = (user && ROLE_LEVEL[user.role] >= ROLE_LEVEL.DIRECTEUR_TRAVAUX) ?? false;

  const [showLotForm, setShowLotForm] = useState(false);
  const [lotCode, setLotCode] = useState('');
  const [lotName, setLotName] = useState('');

  const { data: lots, isLoading } = useQuery({
    queryKey: ['planning', siteId],
    queryFn: () => planningApi.listLots(siteId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['planning', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site', siteId, 'kpi'] });
    void queryClient.invalidateQueries({ queryKey: ['sites'] });
  };

  const createLot = useMutation({
    mutationFn: () => planningApi.createLot(siteId, { code: lotCode, name: lotName }),
    onSuccess: () => {
      setLotCode('');
      setLotName('');
      setShowLotForm(false);
      refresh();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500 py-8 text-center">Chargement du planning…</p>;
  }

  const summary = (() => {
    const ls = lots ?? [];
    if (ls.length === 0) return null;
    const totW = ls.reduce((a, l) => a + (l.weight || 1), 0) || ls.length;
    const reel = Math.round(ls.reduce((a, l) => a + (l.weight || 1) * l.progressPct, 0) / totW);
    const plan = Math.round(ls.reduce((a, l) => a + (l.weight || 1) * l.plannedPct, 0) / totW);
    const late = ls.reduce((a, l) => a + l.tasksLate, 0);
    return { reel, plan, ecart: reel - plan, late };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-navy">Lots & tâches</h2>
        <div className="flex items-center gap-2">
          {(lots?.length ?? 0) > 0 && (
            <>
              <button
                className="btn-secondary text-sm"
                onClick={async () => {
                  const m = await import('@/lib/exportPlanning');
                  m.exportLotsToExcel({ name: siteName, reference: siteReference }, lots ?? []);
                }}
                title="Résumé d'avancement par lot (Excel)"
              >
                Excel
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={async () => {
                  const m = await import('@/lib/exportPlanning');
                  m.exportLotsToPdf({ name: siteName, reference: siteReference }, lots ?? []);
                }}
                title="Résumé d'avancement par lot (PDF)"
              >
                PDF
              </button>
              <button
                className="btn-secondary text-sm"
                onClick={async () => {
                  const blob = await planningApi.exportMspProject(siteId);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Planning-${siteReference}-${new Date().toISOString().slice(0, 10)}.xml`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="Planning complet au format MS Project (XML, ouvrable dans MS Project)"
              >
                MS Project
              </button>
            </>
          )}
          {canManageLots && (
            <button className="btn-secondary text-sm" onClick={() => setShowLotForm((v) => !v)}>
              {showLotForm ? 'Annuler' : '+ Nouveau lot'}
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="kpi-card">
            <span className="text-xs uppercase tracking-wide text-slate-500">Avancement réel</span>
            <span className="text-2xl font-bold text-cyan">{summary.reel} %</span>
          </div>
          <div className="kpi-card">
            <span className="text-xs uppercase tracking-wide text-slate-500">Planifié à date</span>
            <span className="text-2xl font-bold text-navy">{summary.plan} %</span>
          </div>
          <div className="kpi-card">
            <span className="text-xs uppercase tracking-wide text-slate-500">Écart planning</span>
            <span className={`text-2xl font-bold ${summary.ecart < 0 ? 'text-red' : 'text-green'}`}>
              {summary.ecart > 0 ? '+' : ''}{summary.ecart} pts
            </span>
          </div>
          <div className="kpi-card">
            <span className="text-xs uppercase tracking-wide text-slate-500">Tâches en retard</span>
            <span className={`text-2xl font-bold ${summary.late > 0 ? 'text-red' : 'text-green'}`}>
              {summary.late}
            </span>
          </div>
        </div>
      )}

      {showLotForm && (
        <form
          className="card flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createLot.mutate();
          }}
        >
          <div>
            <label className="block text-xs text-slate-500 mb-1">Code</label>
            <input
              className="input w-32"
              placeholder="LOT-1"
              required
              value={lotCode}
              onChange={(e) => setLotCode(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-500 mb-1">Intitulé</label>
            <input
              className="input"
              placeholder="Gros œuvre"
              required
              minLength={2}
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={createLot.isPending}>
            {createLot.isPending ? 'Ajout…' : 'Ajouter'}
          </button>
        </form>
      )}

      {(lots?.length ?? 0) === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          Aucun lot pour ce chantier. {canManageLots && 'Créez le premier lot pour démarrer le planning.'}
        </div>
      ) : (
        lots?.map((lot) => (
          <LotCard
            key={lot.id}
            siteId={siteId}
            lot={lot}
            canManageLots={canManageLots}
            onChange={refresh}
          />
        ))
      )}
    </div>
  );
}

function LotCard({
  siteId,
  lot,
  canManageLots,
  onChange,
}: {
  siteId: string;
  lot: Lot;
  canManageLots: boolean;
  onChange: () => void;
}) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskName, setTaskName] = useState('');

  const createTask = useMutation({
    mutationFn: () => planningApi.createTask(siteId, lot.id, { name: taskName }),
    onSuccess: () => {
      setTaskName('');
      setShowTaskForm(false);
      onChange();
    },
  });

  const deleteLot = useMutation({
    mutationFn: () => planningApi.deleteLot(siteId, lot.id),
    onSuccess: onChange,
  });

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-medium text-navy truncate">
            <span className="text-cyan-dark">{lot.code}</span> · {lot.name}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>{lot.tasks.length} tâche(s)</span>
            {lot.tasksLate > 0 && (
              <span className="text-red font-medium">
                · {lot.tasksLate} en retard{lot.retardJoursMax > 0 ? ` (max ${lot.retardJoursMax} j)` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400" title="Avancement planifié à date">
            plan. {lot.plannedPct}%
          </span>
          <span className="text-sm font-semibold text-navy w-10 text-right">
            {lot.progressPct}%
          </span>
          {canManageLots && (
            <button
              className="text-xs text-red hover:underline"
              onClick={() => deleteLot.mutate()}
              title="Supprimer le lot"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <ProgressBar value={lot.progressPct} />
        {/* repère d'avancement planifié */}
        <div
          className="absolute top-0 h-2 w-0.5 bg-navy/70"
          style={{ left: `${Math.min(100, Math.max(0, lot.plannedPct))}%` }}
          title={`Planifié : ${lot.plannedPct}%`}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {lot.tasks.map((task) => (
          <TaskRow
            key={task.id}
            siteId={siteId}
            lotId={lot.id}
            task={task}
            canManageLots={canManageLots}
            onChange={onChange}
          />
        ))}
      </ul>

      <div className="mt-3">
        {showTaskForm ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              createTask.mutate();
            }}
          >
            <input
              className="input flex-1 min-w-[180px]"
              placeholder="Nouvelle tâche"
              required
              minLength={2}
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
            />
            <button type="submit" className="btn-primary text-sm" disabled={createTask.isPending}>
              Ajouter
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setShowTaskForm(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <button className="text-sm text-cyan-dark hover:underline" onClick={() => setShowTaskForm(true)}>
            + Ajouter une tâche
          </button>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  siteId,
  lotId,
  task,
  canManageLots,
  onChange,
}: {
  siteId: string;
  lotId: string;
  task: Task;
  canManageLots: boolean;
  onChange: () => void;
}) {
  const [progress, setProgress] = useState(task.progressPct);

  const update = useMutation({
    mutationFn: (payload: TaskPayload) =>
      planningApi.updateTask(siteId, lotId, task.id, payload),
    onSuccess: onChange,
  });

  const remove = useMutation({
    mutationFn: () => planningApi.deleteTask(siteId, lotId, task.id),
    onSuccess: onChange,
  });

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 ${
        task.enRetard ? 'bg-red-light/60' : 'bg-surface-1'
      }`}
    >
      <span className="flex-1 min-w-[140px] text-sm text-navy">{task.name}</span>

      {task.enRetard && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red text-white font-medium">
          Retard {task.retardJours} j
        </span>
      )}

      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[task.status]}`}>
        {TASK_STATUS_LABELS[task.status]}
      </span>

      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={progress}
        onChange={(e) => setProgress(Number(e.target.value))}
        onMouseUp={() => update.mutate({ progressPct: progress })}
        onTouchEnd={() => update.mutate({ progressPct: progress })}
        className="w-32 accent-cyan"
        aria-label={`Avancement de ${task.name}`}
      />
      <span className="w-10 text-right text-sm font-medium text-navy">{progress}%</span>

      {canManageLots && (
        <button
          className="text-xs text-red hover:underline"
          onClick={() => remove.mutate()}
          title="Supprimer la tâche"
        >
          ✕
        </button>
      )}
    </li>
  );
}

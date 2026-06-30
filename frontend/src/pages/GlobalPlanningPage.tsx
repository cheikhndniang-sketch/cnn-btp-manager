import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { TASK_STATUS_LABELS, type TaskStatus } from '@/api/types';
import { formatDate } from '@/lib/format';

const STATUS_BADGE: Record<TaskStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-500',
  IN_PROGRESS: 'bg-cyan/10 text-cyan-dark',
  DONE: 'bg-green-light text-green',
  BLOCKED: 'bg-red/10 text-red',
};

type FilterStatus = TaskStatus | 'LATE' | 'ALL';

export function GlobalPlanningPage() {
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['dashboard', 'planning'],
    queryFn: dashboardApi.planningGlobal,
  });

  const siteOptions = useMemo(
    () => [{ id: 'ALL', label: 'Tous les chantiers' }, ...sites.map((s) => ({ id: s.siteId, label: `${s.siteReference} — ${s.siteName}` }))],
    [sites],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sites
      .filter((s) => siteFilter === 'ALL' || s.siteId === siteFilter)
      .map((s) => ({
        ...s,
        lots: s.lots
          .map((l) => ({
            ...l,
            tasks: l.tasks.filter((t) => {
              const matchSearch = !q || t.name.toLowerCase().includes(q) || l.name.toLowerCase().includes(q);
              const matchStatus =
                statusFilter === 'ALL' ||
                (statusFilter === 'LATE' && t.enRetard) ||
                t.status === statusFilter;
              return matchSearch && matchStatus;
            }),
          }))
          .filter((l) => l.tasks.length > 0),
      }))
      .filter((s) => s.lots.length > 0);
  }, [sites, siteFilter, statusFilter, search]);

  const totalTasks = filtered.reduce((s, site) => s + site.lots.reduce((a, l) => a + l.tasks.length, 0), 0);
  const lateTasks = sites.reduce(
    (s, site) => s + site.lots.reduce((a, l) => a + l.tasks.filter((t) => t.enRetard).length, 0),
    0,
  );

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DashboardLayout>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy mb-1">Planning global</h1>
          <p className="text-sm text-slate-500">Vue consolidée de toutes les tâches — chantiers actifs</p>
        </div>
        {lateTasks > 0 && (
          <div className="flex-shrink-0 bg-red/10 border border-red/20 rounded-lg px-4 py-2 text-sm font-semibold text-red">
            {lateTasks} tâche{lateTasks > 1 ? 's' : ''} en retard
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-500 mb-1">Chantier</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="input w-full text-sm"
            >
              {siteOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="input text-sm"
            >
              <option value="ALL">Tous</option>
              <option value="LATE">En retard</option>
              <option value="IN_PROGRESS">En cours</option>
              <option value="NOT_STARTED">À démarrer</option>
              <option value="BLOCKED">Bloqué</option>
              <option value="DONE">Terminé</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-slate-500 mb-1">Recherche</label>
            <input
              type="search"
              placeholder="Nom de tâche ou lot…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input w-full text-sm"
            />
          </div>
          <div className="text-xs text-slate-400 self-end pb-2">
            {totalTasks} tâche{totalTasks !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-16 text-center">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-400">Aucune tâche correspondante.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((site) => (
            <div key={site.siteId} className="card p-0 overflow-hidden">
              {/* Site header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-navy/5 hover:bg-navy/10 transition-colors text-left"
                onClick={() => toggleCollapse(site.siteId)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-navy">{site.siteName}</span>
                  <span className="text-xs text-slate-400">{site.siteReference}</span>
                  <span className="text-xs text-slate-500">
                    {site.lots.reduce((a, l) => a + l.tasks.length, 0)} tâche{site.lots.reduce((a, l) => a + l.tasks.length, 0) !== 1 ? 's' : ''}
                  </span>
                  {site.lots.some((l) => l.tasks.some((t) => t.enRetard)) && (
                    <span className="text-xs bg-red/10 text-red px-2 py-0.5 rounded-full font-medium">
                      {site.lots.reduce((a, l) => a + l.tasks.filter((t) => t.enRetard).length, 0)} en retard
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/sites/${site.siteId}?tab=planning`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-cyan-dark hover:underline"
                  >
                    Ouvrir le chantier →
                  </Link>
                  <span className="text-slate-400 text-sm">{collapsed.has(site.siteId) ? '▼' : '▲'}</span>
                </div>
              </button>

              {!collapsed.has(site.siteId) && (
                <div className="divide-y divide-slate-100">
                  {site.lots.map((lot) => (
                    <div key={lot.id} className="px-4 py-3">
                      <div className="text-xs font-semibold text-cyan-dark uppercase tracking-wide mb-2">
                        {lot.code} — {lot.name}
                      </div>
                      <div className="space-y-1.5">
                        {lot.tasks.map((task) => (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 text-sm rounded-lg px-3 py-2 ${
                              task.enRetard ? 'bg-red/5' : 'hover:bg-surface-1'
                            }`}
                          >
                            {/* Progress bar */}
                            <div className="w-20 flex-shrink-0">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${task.status === 'DONE' ? 'bg-green' : task.enRetard ? 'bg-red' : 'bg-cyan'}`}
                                  style={{ width: `${task.progressPct}%` }}
                                />
                              </div>
                            </div>
                            <span className="flex-1 text-navy truncate">{task.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                              task.enRetard ? 'bg-red/10 text-red' : STATUS_BADGE[task.status]
                            }`}>
                              {task.enRetard ? 'En retard' : TASK_STATUS_LABELS[task.status]}
                            </span>
                            <span className="text-xs text-slate-400 flex-shrink-0 w-20 text-right">
                              {task.progressPct} %
                            </span>
                            {task.endDate && (
                              <span className={`text-xs flex-shrink-0 w-24 text-right ${task.enRetard ? 'text-red font-medium' : 'text-slate-400'}`}>
                                {formatDate(task.endDate)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

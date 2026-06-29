import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { sitesApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KpiCard } from '@/components/KpiCard';
import { CreateSiteModal } from '@/components/CreateSiteModal';
import { useAuth } from '@/hooks/useAuth';
import { formatFCFA } from '@/lib/format';
import type { Site } from '@/api/types';

const STATUS_BADGE: Record<Site['status'], string> = {
  ACTIVE: 'bg-green-light text-green',
  ARCHIVED: 'bg-slate-100 text-slate-500',
  COMPLETED: 'bg-cyan/10 text-cyan-dark',
};

const STATUS_LABELS: Record<Site['status'], string> = {
  ACTIVE: 'Actif',
  ARCHIVED: 'Archivé',
  COMPLETED: 'Terminé',
};

export function DashboardPage() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Site['status'] | 'ALL'>('ALL');
  const canCreate = user?.role === 'ADMIN' || user?.role === 'DIRECTEUR_PROJET';

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: sitesApi.list,
  });

  const activeSites = sites.filter((s) => s.status === 'ACTIVE');
  const totalBudget = activeSites.reduce((acc, s) => acc + s.marcheHt, 0);
  const avgProgress =
    activeSites.length > 0
      ? Math.round(activeSites.reduce((acc, s) => acc + s.avancementPct, 0) / activeSites.length)
      : 0;
  const avgPlanifie =
    activeSites.length > 0
      ? Math.round(activeSites.reduce((acc, s) => acc + s.avancementPlanifie, 0) / activeSites.length)
      : 0;
  const totalLate = sites.reduce((acc, s) => acc + s.tasksLate, 0);
  const sitesEnRetard = activeSites.filter((s) => s.tasksLate > 0);
  const ecartMoyen = avgProgress - avgPlanifie;

  const filteredSites =
    statusFilter === 'ALL' ? sites : sites.filter((s) => s.status === statusFilter);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy mb-1">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble multi-chantiers — CSE Immobilier</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Nouveau chantier
          </button>
        )}
      </div>

      {showCreate && <CreateSiteModal onClose={() => setShowCreate(false)} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Chantiers actifs" value={activeSites.length} accent="cyan" />
        <KpiCard
          label="Budget HT cumulé"
          value={formatFCFA(totalBudget)}
          accent="navy"
        />
        <KpiCard
          label="Avancement physique"
          value={`${avgProgress} %`}
          accent="green"
          hint={`Planifié : ${avgPlanifie} %`}
        />
        <KpiCard
          label="Écart planning"
          value={`${ecartMoyen > 0 ? '+' : ''}${ecartMoyen} %`}
          accent={ecartMoyen >= 0 ? 'green' : 'red'}
          hint={ecartMoyen >= 0 ? 'En avance' : 'En retard'}
        />
        <KpiCard
          label="Tâches en retard"
          value={totalLate}
          accent={totalLate > 0 ? 'red' : 'green'}
          hint={totalLate > 0 ? 'Attention requise' : 'Aucun retard'}
        />
      </div>

      {/* Alert banner */}
      {sitesEnRetard.length > 0 && (
        <div className="mb-5 rounded-lg bg-red/10 border border-red/20 px-4 py-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm font-semibold text-red">
            {sitesEnRetard.length} chantier{sitesEnRetard.length > 1 ? 's' : ''} avec des tâches en retard
          </span>
          <div className="flex flex-wrap gap-2">
            {sitesEnRetard.map((s) => (
              <Link
                key={s.id}
                to={`/sites/${s.id}`}
                className="text-xs bg-white border border-red/30 text-red px-2 py-0.5 rounded-full hover:bg-red/5"
              >
                {s.name} ({s.tasksLate})
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main content: 2 columns */}
      {!isLoading && activeSites.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          {/* Left: Avancement par chantier (3/5) */}
          <div className="lg:col-span-3 card">
            <h2 className="font-semibold text-navy mb-4">Avancement par chantier</h2>
            <div className="space-y-3">
              {activeSites
                .sort((a, b) => b.avancementPct - a.avancementPct)
                .map((site) => {
                  const ecart = site.avancementPct - site.avancementPlanifie;
                  return (
                    <div key={site.id}>
                      <div className="flex justify-between items-center mb-1">
                        <Link
                          to={`/sites/${site.id}`}
                          className="text-sm font-medium text-navy hover:underline truncate max-w-[55%]"
                        >
                          {site.name}
                        </Link>
                        <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
                          <span className={ecart >= 0 ? 'text-green font-medium' : 'text-red font-medium'}>
                            {ecart > 0 ? '+' : ''}{ecart.toFixed(0)} %
                          </span>
                          <span>
                            {site.avancementPct} % <span className="text-slate-300">/</span> {site.avancementPlanifie} %
                          </span>
                          {site.tasksLate > 0 && (
                            <span className="text-red">{site.tasksLate} retard{site.tasksLate > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan transition-all"
                          style={{ width: `${Math.min(100, site.avancementPct)}%` }}
                        />
                        {site.avancementPlanifie > 0 && (
                          <div
                            className="absolute top-0 h-full w-0.5 bg-navy/60"
                            style={{ left: `${Math.min(100, site.avancementPlanifie)}%` }}
                            title={`Planifié : ${site.avancementPlanifie} %`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-2 rounded-full bg-cyan" />
                Avancement physique
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-0.5 h-3 bg-navy/60" />
                Planifié
              </span>
            </div>
          </div>

          {/* Right: Budget répartition (2/5) */}
          <div className="lg:col-span-2 card">
            <h2 className="font-semibold text-navy mb-4">Répartition du budget</h2>
            {totalBudget === 0 ? (
              <p className="text-xs text-slate-400">Budget non renseigné</p>
            ) : (
              <div className="space-y-3">
                {activeSites
                  .sort((a, b) => b.marcheHt - a.marcheHt)
                  .map((site) => {
                    const pct = totalBudget > 0 ? (site.marcheHt / totalBudget) * 100 : 0;
                    return (
                      <div key={site.id}>
                        <div className="flex justify-between text-xs mb-1">
                          <Link
                            to={`/sites/${site.id}`}
                            className="font-medium text-navy hover:underline truncate"
                          >
                            {site.name}
                          </Link>
                          <span className="text-slate-500 shrink-0 ml-2">{pct.toFixed(0)} %</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-navy/70 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatFCFA(site.marcheHt)}</div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Status summary */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-medium text-slate-500 mb-2">Statuts</h3>
              <div className="flex flex-wrap gap-2">
                {(['ACTIVE', 'COMPLETED', 'ARCHIVED'] as Site['status'][]).map((st) => {
                  const count = sites.filter((s) => s.status === st).length;
                  return (
                    <span key={st} className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[st]}`}>
                      {STATUS_LABELS[st]} ({count})
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sites list */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-navy">Tous les chantiers</h2>
          <div className="flex gap-1">
            {(['ALL', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === f
                    ? 'bg-navy text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'ALL' ? 'Tous' : STATUS_LABELS[f]}
                <span className="ml-1 opacity-70">
                  ({f === 'ALL' ? sites.length : sites.filter((s) => s.status === f).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
        ) : filteredSites.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Aucun chantier.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredSites.map((site) => (
              <li key={site.id}>
                <Link
                  to={`/sites/${site.id}`}
                  className="flex flex-col gap-2 py-4 hover:bg-surface-1 rounded-lg px-2 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-navy">{site.name}</div>
                      <div className="text-xs text-slate-500">
                        {site.reference} · {site.location ?? 'Localisation non renseignée'} · {formatFCFA(site.marcheHt)} HT
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {site.tasksLate > 0 && (
                        <span className="text-xs text-red font-medium bg-red/10 px-2 py-0.5 rounded-full">
                          {site.tasksLate} retard{site.tasksLate > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_BADGE[site.status]}`}>
                        {STATUS_LABELS[site.status]}
                      </span>
                    </div>
                  </div>
                  {site.status === 'ACTIVE' && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>Avancement</span>
                        <span>
                          {site.avancementPct} %{' '}
                          <span className="text-slate-400">/ plan. {site.avancementPlanifie} %</span>
                          {site.avancementPct - site.avancementPlanifie !== 0 && (
                            <span className={site.avancementPct >= site.avancementPlanifie ? 'text-green ml-1 font-medium' : 'text-red ml-1 font-medium'}>
                              ({site.avancementPct - site.avancementPlanifie > 0 ? '+' : ''}{site.avancementPct - site.avancementPlanifie} %)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="relative h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-cyan"
                          style={{ width: `${Math.min(100, site.avancementPct)}%` }}
                        />
                        {site.avancementPlanifie > 0 && (
                          <div
                            className="absolute top-0 h-full w-0.5 bg-navy/70"
                            style={{ left: `${Math.min(100, Math.max(0, site.avancementPlanifie))}%` }}
                            title={`Planifié : ${site.avancementPlanifie} %`}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Budget total footer */}
      {sites.length > 0 && (
        <div className="text-center text-xs text-slate-400 mt-4">
          Budget HT total tous chantiers : {formatFCFA(sites.reduce((acc, s) => acc + s.marcheHt, 0))}
        </div>
      )}
    </DashboardLayout>
  );
}

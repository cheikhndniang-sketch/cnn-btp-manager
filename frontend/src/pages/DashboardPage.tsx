import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { sitesApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KpiCard } from '@/components/KpiCard';
import { formatFCFA } from '@/lib/format';
import type { Site } from '@/api/types';

const STATUS_BADGE: Record<Site['status'], string> = {
  ACTIVE: 'bg-green-light text-green',
  ARCHIVED: 'bg-slate-100 text-slate-500',
  COMPLETED: 'bg-cyan/10 text-cyan-dark',
};

export function DashboardPage() {
  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: sitesApi.list,
  });

  const activeSites = sites?.filter((s) => s.status === 'ACTIVE') ?? [];
  const totalBudget = activeSites.reduce((acc, s) => acc + s.marcheHt, 0);
  const avgProgress =
    activeSites.length > 0
      ? Math.round(
          activeSites.reduce((acc, s) => acc + s.avancementPct, 0) / activeSites.length,
        )
      : 0;

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold text-navy mb-1">Tableau de bord</h1>
      <p className="text-sm text-slate-500 mb-6">
        Vue d'ensemble des chantiers CSE Immobilier
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total chantiers" value={sites?.length ?? 0} accent="navy" />
        <KpiCard label="Alertes" value={0} accent="red" hint="Aucune alerte active" />
        <KpiCard
          label="Production du mois"
          value={formatFCFA(0)}
          accent="cyan"
          hint="Disponible en Phase 2"
        />
        <KpiCard label="Avancement moyen" value={`${avgProgress} %`} accent="green" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-navy">Chantiers</h2>
          <span className="text-sm text-slate-500">
            Budget actif cumulé : {formatFCFA(totalBudget)}
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
        ) : activeSites.length === 0 && (sites?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Aucun chantier accessible.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sites?.map((site) => (
              <li key={site.id}>
                <Link
                  to={`/sites/${site.id}`}
                  className="flex flex-col gap-2 py-4 hover:bg-surface-1 rounded-lg px-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-navy">{site.name}</div>
                      <div className="text-xs text-slate-500">
                        {site.reference} · {site.location ?? 'Localisation non renseignée'}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_BADGE[site.status]}`}
                    >
                      {site.status}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Avancement</span>
                      <span>{site.avancementPct} %</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-cyan"
                        style={{ width: `${site.avancementPct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}

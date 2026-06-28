import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sitesApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KpiCard } from '@/components/KpiCard';
import { PlanningTab } from '@/components/PlanningTab';
import { formatDate, formatFCFA } from '@/lib/format';
import { ROLE_LABELS } from '@/api/types';

const TABS = [
  { key: 'general', label: 'Vue générale', enabled: true },
  { key: 'planning', label: 'Planning', enabled: true },
  { key: 'rapports', label: 'Rapports', enabled: false },
  { key: 'finance', label: 'Finance', enabled: false },
  { key: 'st', label: 'Sous-traitance', enabled: false },
  { key: 'docs', label: 'Documents', enabled: false },
] as const;

export function SiteDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<string>('general');

  const siteQuery = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id),
    enabled: !!id,
  });

  const kpiQuery = useQuery({
    queryKey: ['site', id, 'kpi'],
    queryFn: () => sitesApi.kpi(id),
    enabled: !!id,
  });

  const site = siteQuery.data;
  const kpi = kpiQuery.data;

  return (
    <DashboardLayout>
      <Link to="/dashboard" className="text-sm text-cyan-dark hover:underline">
        ← Retour aux chantiers
      </Link>

      {siteQuery.isLoading ? (
        <p className="mt-6 text-sm text-slate-500">Chargement…</p>
      ) : siteQuery.isError || !site ? (
        <p className="mt-6 text-sm text-red">Chantier introuvable ou accès refusé.</p>
      ) : (
        <>
          <header className="mt-4 mb-6">
            <h1 className="text-2xl font-bold text-navy">{site.name}</h1>
            <p className="text-sm text-slate-500">
              {site.reference} · {site.location ?? '—'}
            </p>
          </header>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Avancement" value={`${kpi?.avancementPct ?? 0} %`} accent="green" />
            <KpiCard
              label="Budget total"
              value={formatFCFA(kpi?.budgetTotal ?? site.marcheHt)}
              accent="cyan"
            />
            <KpiCard label="Jours restants" value={kpi?.joursRestants ?? '—'} accent="orange" />
            <KpiCard label="Membres" value={kpi?.membresCount ?? site.members.length} accent="navy" />
          </div>

          <div className="border-b border-slate-200 mb-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                disabled={!t.enabled}
                onClick={() => t.enabled && setTab(t.key)}
                className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-cyan text-cyan-dark font-medium'
                    : t.enabled
                      ? 'border-transparent text-slate-600 hover:text-navy'
                      : 'border-transparent text-slate-300 cursor-not-allowed'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'general' ? (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <h2 className="font-semibold text-navy mb-3">Informations</h2>
                <dl className="text-sm space-y-2">
                  <Row label="Statut" value={site.status} />
                  <Row label="Début" value={formatDate(site.startDate)} />
                  <Row label="Fin prévue" value={formatDate(site.endDatePlanned)} />
                  <Row label="Marché HT" value={formatFCFA(site.marcheHt)} />
                  <Row label="TVA" value={`${(site.tvaRate * 100).toFixed(0)} %`} />
                </dl>
                {site.description && (
                  <p className="mt-3 text-sm text-slate-600">{site.description}</p>
                )}
              </div>

              <div className="card">
                <h2 className="font-semibold text-navy mb-3">
                  Équipe ({site.members.length})
                </h2>
                <ul className="divide-y divide-slate-100 text-sm">
                  {site.members.map((m) => (
                    <li key={m.userId} className="flex justify-between py-2">
                      <span className="text-navy">{m.name}</span>
                      <span className="text-slate-500">{ROLE_LABELS[m.role]}</span>
                    </li>
                  ))}
                  {site.members.length === 0 && (
                    <li className="py-2 text-slate-400">Aucun membre affecté.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : tab === 'planning' ? (
            <PlanningTab siteId={site.id} />
          ) : (
            <div className="card text-center py-16">
              <p className="text-slate-500">
                Cette section sera{' '}
                <span className="font-medium text-navy">disponible en Phase 2</span>.
              </p>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-navy font-medium">{value}</dd>
    </div>
  );
}

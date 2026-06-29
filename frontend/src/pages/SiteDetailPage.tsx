import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sitesApi, planningApi, financeApi, sousTraitanceApi, travauxSuppApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KpiCard } from '@/components/KpiCard';
import { PlanningTab } from '@/components/PlanningTab';
import { FinanceTab } from '@/components/FinanceTab';
import { SousTraitanceTab } from '@/components/SousTraitanceTab';
import { DocumentsTab } from '@/components/DocumentsTab';
import { TSTab } from '@/components/TSTab';
import { formatDate, formatFCFA } from '@/lib/format';
import { exportRapportToPdf } from '@/lib/exportRapport';
import { ROLE_LABELS } from '@/api/types';

const TABS = [
  { key: 'general', label: 'Vue générale', enabled: true },
  { key: 'planning', label: 'Planning', enabled: true },
  { key: 'ts', label: 'Travaux suppl.', enabled: true },
  { key: 'finance', label: 'Finance', enabled: true },
  { key: 'st', label: 'Sous-traitance', enabled: true },
  { key: 'docs', label: 'Documents', enabled: true },
] as const;

export function SiteDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<string>('general');
  const [exportingPdf, setExportingPdf] = useState(false);

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

  const handleRapportPdf = async () => {
    if (!site || exportingPdf) return;
    setExportingPdf(true);
    try {
      const [lots, situations, sousTraitants, travauxSupp] = await Promise.all([
        planningApi.listLots(id),
        financeApi.listSituations(id),
        sousTraitanceApi.list(id),
        travauxSuppApi.list(id),
      ]);

      const validees = situations.filter((s) => s.status === 'VALIDEE' || s.status === 'PAYEE');
      const lastSituation = validees.sort((a, b) => b.numero - a.numero)[0] ?? null;

      const now = new Date();
      const periodeLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now);

      exportRapportToPdf({
        site,
        kpi: kpi ?? null,
        lots,
        lastSituation,
        sousTraitants,
        travauxSupp,
        periodeLabel,
      });
    } finally {
      setExportingPdf(false);
    }
  };

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
          <header className="mt-4 mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-navy">{site.name}</h1>
              <p className="text-sm text-slate-500">
                {site.reference} · {site.location ?? '—'}
              </p>
            </div>
            <button
              onClick={handleRapportPdf}
              disabled={exportingPdf}
              className="btn-secondary text-sm shrink-0"
            >
              {exportingPdf ? 'Génération…' : 'Rapport PDF'}
            </button>
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
            <PlanningTab
              siteId={site.id}
              siteName={site.name}
              siteReference={site.reference}
            />
          ) : tab === 'ts' ? (
            <TSTab siteId={site.id} />
          ) : tab === 'finance' ? (
            <FinanceTab
              siteId={site.id}
              siteName={site.name}
              siteReference={site.reference}
            />
          ) : tab === 'st' ? (
            <SousTraitanceTab siteId={site.id} />
          ) : tab === 'docs' ? (
            <DocumentsTab siteId={site.id} />
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

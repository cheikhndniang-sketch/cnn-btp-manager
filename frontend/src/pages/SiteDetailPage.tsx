import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sitesApi, planningApi, financeApi, sousTraitanceApi, travauxSuppApi, usersApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { KpiCard } from '@/components/KpiCard';
import { PlanningTab } from '@/components/PlanningTab';
import { FinanceTab } from '@/components/FinanceTab';
import { SousTraitanceTab } from '@/components/SousTraitanceTab';
import { DocumentsTab } from '@/components/DocumentsTab';
import { TSTab } from '@/components/TSTab';
import { formatDate, formatFCFA } from '@/lib/format';
import { exportRapportToPdf } from '@/lib/exportRapport';
import { ROLE_LABELS, type Role, type SiteStatus } from '@/api/types';
import { useAuth } from '@/hooks/useAuth';

const TABS = [
  { key: 'general', label: 'Vue générale', enabled: true },
  { key: 'planning', label: 'Planning', enabled: true },
  { key: 'ts', label: 'Travaux suppl.', enabled: true },
  { key: 'finance', label: 'Finance', enabled: true },
  { key: 'st', label: 'Sous-traitance', enabled: true },
  { key: 'docs', label: 'Documents', enabled: true },
] as const;

const STATUS_LABELS: Record<SiteStatus, string> = {
  ACTIVE: 'Actif',
  ARCHIVED: 'Archivé',
  COMPLETED: 'Terminé',
};

const STATUS_BADGE: Record<SiteStatus, string> = {
  ACTIVE: 'bg-green-light text-green',
  ARCHIVED: 'bg-slate-100 text-slate-500',
  COMPLETED: 'bg-cyan/10 text-cyan-dark',
};

const SITE_STATUS_TRANSITIONS: Record<SiteStatus, { label: string; next: SiteStatus }[]> = {
  ACTIVE: [
    { label: 'Marquer terminé', next: 'COMPLETED' },
    { label: 'Archiver', next: 'ARCHIVED' },
  ],
  COMPLETED: [
    { label: 'Réactiver', next: 'ACTIVE' },
    { label: 'Archiver', next: 'ARCHIVED' },
  ],
  ARCHIVED: [
    { label: 'Réactiver', next: 'ACTIVE' },
  ],
};

// ── Modal affecter un membre ──────────────────────────────────────────
interface AddMemberModalProps {
  siteId: string;
  existingUserIds: string[];
  onClose: () => void;
}

function AddMemberModal({ siteId, existingUserIds, onClose }: AddMemberModalProps) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('CONDUCTEUR_TRAVAUX');
  const [error, setError] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ isActive: true }),
  });

  const available = users.filter(
    (u) => !existingUserIds.includes(u.id) && u.role !== 'ADMIN',
  );

  const mutation = useMutation({
    mutationFn: () => sitesApi.addMember(siteId, { userId, role }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['site', siteId] });
      onClose();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setError(e.response?.data?.message ?? 'Erreur lors de l\'ajout');
    },
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!userId) { setError('Sélectionnez un utilisateur'); return; }
    mutation.mutate();
  };

  // Close on backdrop click
  const backdropRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-navy mb-4">Affecter un membre</h2>

        {available.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">Tous les utilisateurs actifs sont déjà membres de ce chantier.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Utilisateur</label>
              <select
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setError(''); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan/40"
              >
                <option value="">Sélectionner…</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.username}) — {ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rôle sur le chantier</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan/40"
              >
                {(['DIRECTEUR_PROJET', 'DIRECTEUR_TRAVAUX', 'CONDUCTEUR_TRAVAUX'] as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red">{error}</p>}

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">
                Annuler
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="btn-primary text-sm"
              >
                {mutation.isPending ? 'Ajout…' : 'Affecter'}
              </button>
            </div>
          </form>
        )}

        {available.length === 0 && (
          <div className="flex justify-end">
            <button onClick={onClose} className="btn-secondary text-sm">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────
export function SiteDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('general');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const canManage = user?.role === 'ADMIN' || user?.role === 'DIRECTEUR_PROJET';

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

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => sitesApi.removeMember(id, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['site', id] }),
  });

  const changeStatusMutation = useMutation({
    mutationFn: (status: SiteStatus) => sitesApi.changeStatus(id, status),
    onSuccess: () => {
      setStatusMenuOpen(false);
      void qc.invalidateQueries({ queryKey: ['site', id] });
      void qc.invalidateQueries({ queryKey: ['sites'] });
    },
  });

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
          <header className="mt-4 mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-navy">{site.name}</h1>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[site.status]}`}>
                  {STATUS_LABELS[site.status]}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {site.reference} · {site.location ?? '—'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status change dropdown — ADMIN/DP only */}
              {canManage && SITE_STATUS_TRANSITIONS[site.status].length > 0 && (
                <div ref={statusMenuRef} className="relative">
                  <button
                    onClick={() => setStatusMenuOpen((v) => !v)}
                    className="btn-secondary text-sm"
                  >
                    Statut ▾
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute right-0 top-10 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                      {SITE_STATUS_TRANSITIONS[site.status].map(({ label, next }) => (
                        <button
                          key={next}
                          onClick={() => changeStatusMutation.mutate(next)}
                          disabled={changeStatusMutation.isPending}
                          className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-surface-1 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleRapportPdf}
                disabled={exportingPdf}
                className="btn-secondary text-sm"
              >
                {exportingPdf ? 'Génération…' : 'Rapport PDF'}
              </button>
            </div>
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
              {/* Informations */}
              <div className="card">
                <h2 className="font-semibold text-navy mb-3">Informations</h2>
                <dl className="text-sm space-y-2">
                  <Row label="Statut" value={STATUS_LABELS[site.status]} />
                  <Row label="Début" value={formatDate(site.startDate)} />
                  <Row label="Fin prévue" value={formatDate(site.endDatePlanned)} />
                  <Row label="Marché HT" value={formatFCFA(site.marcheHt)} />
                  <Row label="TVA" value={`${(site.tvaRate * 100).toFixed(0)} %`} />
                  <Row label="Taux RG" value={`${(site.tauxRg * 100).toFixed(0)} %`} />
                  {site.avanceForfaitaire > 0 && (
                    <Row label="Avance forfaitaire" value={formatFCFA(site.avanceForfaitaire)} />
                  )}
                </dl>
                {site.description && (
                  <p className="mt-3 text-sm text-slate-600 border-t border-slate-100 pt-3">{site.description}</p>
                )}
              </div>

              {/* Équipe */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-navy">
                    Équipe ({site.members.length})
                  </h2>
                  {canManage && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="text-xs font-medium text-cyan-dark border border-cyan/40 hover:border-cyan/70 rounded-lg px-3 py-1.5 transition-colors hover:bg-cyan/5"
                    >
                      + Affecter un membre
                    </button>
                  )}
                </div>

                {site.members.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">Aucun membre affecté.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {site.members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between py-2.5 gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-navy truncate">{m.name}</div>
                          <div className="text-xs text-slate-400">{ROLE_LABELS[m.role]}</div>
                        </div>
                        {canManage && m.userId !== user?.id && (
                          <button
                            onClick={() => removeMemberMutation.mutate(m.userId)}
                            disabled={removeMemberMutation.isPending}
                            className="flex-shrink-0 text-xs text-slate-400 hover:text-red transition-colors px-2 py-1 rounded hover:bg-red/5"
                            title="Retirer du chantier"
                          >
                            Retirer
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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

          {showAddMember && (
            <AddMemberModal
              siteId={site.id}
              existingUserIds={site.members.map((m) => m.userId)}
              onClose={() => setShowAddMember(false)}
            />
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

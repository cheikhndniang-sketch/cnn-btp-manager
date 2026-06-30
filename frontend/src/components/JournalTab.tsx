import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rapportsApi, sitesApi, type CreateRapportPayload } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { METEO_LABELS, type Meteo, type RapportChantier, type Role } from '@/api/types';
import { formatDate } from '@/lib/format';

const ALL_ROLES: Role[] = ['ADMIN', 'DIRECTEUR_PROJET', 'DIRECTEUR_TRAVAUX', 'CONDUCTEUR_TRAVAUX'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  siteId: string;
}

interface FormState {
  date: string;
  meteo: Meteo | '';
  effectif: string;
  travauxRealises: string;
  materiaux: string;
  observations: string;
  incidents: string;
}

function emptyForm(): FormState {
  return {
    date: today(),
    meteo: '',
    effectif: '0',
    travauxRealises: '',
    materiaux: '',
    observations: '',
    incidents: '',
  };
}

function rapportToForm(r: RapportChantier): FormState {
  return {
    date: r.date.slice(0, 10),
    meteo: r.meteo ?? '',
    effectif: String(r.effectif),
    travauxRealises: r.travauxRealises ?? '',
    materiaux: r.materiaux ?? '',
    observations: r.observations ?? '',
    incidents: r.incidents ?? '',
  };
}

export function JournalTab({ siteId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user ? ALL_ROLES.includes(user.role as Role) : false;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RapportChantier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: site } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => sitesApi.get(siteId),
  });

  const { data: rapports = [], isLoading } = useQuery({
    queryKey: ['rapports', siteId],
    queryFn: () => rapportsApi.list(siteId),
  });

  const handleExportPdf = async () => {
    if (!rapports.length || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { exportJournalToPdf } = await import('@/lib/exportJournal');
      const now = new Date();
      const periode = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now);
      exportJournalToPdf(
        site?.name ?? siteId,
        site?.reference ?? siteId,
        rapports,
        periode,
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['rapports', siteId] });

  const upsertMut = useMutation({
    mutationFn: (payload: CreateRapportPayload) => rapportsApi.upsert(siteId, payload),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateRapportPayload> }) =>
      rapportsApi.update(siteId, id, payload),
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => rapportsApi.remove(siteId, id),
    onSuccess: invalidate,
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(r: RapportChantier) {
    setEditing(r);
    setForm(rapportToForm(r));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CreateRapportPayload = {
      date: form.date,
      meteo: form.meteo || undefined,
      effectif: Number(form.effectif) || 0,
      travauxRealises: form.travauxRealises || undefined,
      materiaux: form.materiaux || undefined,
      observations: form.observations || undefined,
      incidents: form.incidents || undefined,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, payload });
    } else {
      upsertMut.mutate(payload);
    }
  }

  const isPending = upsertMut.isPending || updateMut.isPending;
  const error = upsertMut.error || updateMut.error;

  const totalJours = rapports.length;
  const totalEffectif = rapports.reduce((s, r) => s + r.effectif, 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <div className="text-2xl font-bold text-navy">{totalJours}</div>
          <div className="text-xs text-slate-500 mt-0.5">Rapports enregistrés</div>
        </div>
        <div className="card py-3 text-center">
          <div className="text-2xl font-bold text-cyan-dark">{totalEffectif}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total présences cumulées</div>
        </div>
        <div className="card py-3 text-center col-span-2 sm:col-span-1">
          <div className="text-2xl font-bold text-navy">
            {totalJours > 0 ? Math.round(totalEffectif / totalJours) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Effectif moyen / jour</div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-navy">Journal de chantier</h2>
        <div className="flex items-center gap-2">
          {rapports.length > 0 && (
            <button
              onClick={() => void handleExportPdf()}
              disabled={exportingPdf}
              className="btn-secondary text-sm"
            >
              {exportingPdf ? 'Génération…' : 'PDF Journal'}
            </button>
          )}
          {canWrite && !showForm && (
            <button onClick={openCreate} className="btn-primary text-sm">
              + Nouveau rapport
            </button>
          )}
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="card border-2 border-cyan/30 space-y-4">
          <h3 className="font-semibold text-navy text-sm">
            {editing ? 'Modifier le rapport' : 'Nouveau rapport de chantier'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Météo</label>
                <select
                  value={form.meteo}
                  onChange={(e) => setForm((f) => ({ ...f, meteo: e.target.value as Meteo | '' }))}
                  className="input w-full text-sm"
                >
                  <option value="">—</option>
                  {(Object.keys(METEO_LABELS) as Meteo[]).map((m) => (
                    <option key={m} value={m}>{METEO_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Effectif présent</label>
                <input
                  type="number"
                  min={0}
                  value={form.effectif}
                  onChange={(e) => setForm((f) => ({ ...f, effectif: e.target.value }))}
                  className="input w-full text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Travaux réalisés</label>
              <textarea
                rows={3}
                value={form.travauxRealises}
                onChange={(e) => setForm((f) => ({ ...f, travauxRealises: e.target.value }))}
                className="input w-full text-sm resize-none"
                placeholder="Décrire les travaux réalisés ce jour…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Matériaux / approvisionnements</label>
              <textarea
                rows={2}
                value={form.materiaux}
                onChange={(e) => setForm((f) => ({ ...f, materiaux: e.target.value }))}
                className="input w-full text-sm resize-none"
                placeholder="Matériaux livrés, quantités…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Observations</label>
              <textarea
                rows={2}
                value={form.observations}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                className="input w-full text-sm resize-none"
                placeholder="Notes diverses, visites, réunions…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Incidents / problèmes
              </label>
              <textarea
                rows={2}
                value={form.incidents}
                onChange={(e) => setForm((f) => ({ ...f, incidents: e.target.value }))}
                className="input w-full text-sm resize-none"
                placeholder="Accidents, pannes, retards, litiges…"
              />
            </div>

            {error && (
              <p className="text-xs text-red">
                {(error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Erreur lors de l\'enregistrement'}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={closeForm} className="btn-secondary text-sm">
                Annuler
              </button>
              <button type="submit" disabled={isPending} className="btn-primary text-sm">
                {isPending ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Chargement…</p>
      ) : rapports.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-sm">Aucun rapport de chantier enregistré.</p>
          {canWrite && !showForm && (
            <button onClick={openCreate} className="mt-3 btn-primary text-sm">
              + Créer le premier rapport
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rapports.map((r) => {
            const isOpen = expanded === r.id;
            const hasContent =
              r.travauxRealises || r.materiaux || r.observations || r.incidents;
            return (
              <div key={r.id} className="card p-0 overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-1 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <span className="font-semibold text-navy text-sm w-28 flex-shrink-0">
                    {formatDate(r.date)}
                  </span>
                  {r.meteo && (
                    <span className="text-sm flex-shrink-0">{METEO_LABELS[r.meteo]}</span>
                  )}
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {r.effectif} pers.
                  </span>
                  {r.travauxRealises && (
                    <span className="text-xs text-slate-400 truncate min-w-0">
                      {r.travauxRealises}
                    </span>
                  )}
                  {r.incidents && (
                    <span className="ml-auto flex-shrink-0 text-xs bg-red/10 text-red px-2 py-0.5 rounded-full">
                      Incident
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0 text-xs text-slate-400">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    {hasContent ? (
                      <>
                        {r.travauxRealises && (
                          <Section title="Travaux réalisés" content={r.travauxRealises} />
                        )}
                        {r.materiaux && (
                          <Section title="Matériaux / approvisionnements" content={r.materiaux} />
                        )}
                        {r.observations && (
                          <Section title="Observations" content={r.observations} />
                        )}
                        {r.incidents && (
                          <Section title="Incidents / problèmes" content={r.incidents} color="text-red" />
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">Aucun détail saisi.</p>
                    )}

                    {canWrite && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="text-xs text-cyan-dark hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Supprimer ce rapport ?')) {
                              removeMut.mutate(r.id);
                              if (expanded === r.id) setExpanded(null);
                            }
                          }}
                          disabled={removeMut.isPending}
                          className="text-xs text-slate-400 hover:text-red transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  content,
  color = 'text-slate-700',
}: {
  title: string;
  content: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-0.5">{title}</div>
      <p className={`text-sm whitespace-pre-wrap ${color}`}>{content}</p>
    </div>
  );
}

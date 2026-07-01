import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { effectifApi, type CreateOuvrierPayload } from '@/api/endpoints';
import { QUALIFICATION_LABELS, type Ouvrier, type QualificationOuvrier } from '@/api/types';
import { formatFCFA } from '@/lib/format';

const QUALIFICATIONS: QualificationOuvrier[] = [
  'MANOEUVRE', 'OUVRIER_SPECIALISE', 'CHEF_EQUIPE',
  'TECHNICIEN', 'AGENT_MAITRISE', 'INGENIEUR', 'AUTRE',
];

function currentMois() {
  return new Date().toISOString().slice(0, 7);
}

// ── Formulaire ouvrier ────────────────────────────────────────────────

interface OuvrierFormProps {
  siteId: string;
  initial?: Partial<Ouvrier>;
  onClose: () => void;
}

function OuvrierForm({ siteId, initial, onClose }: OuvrierFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateOuvrierPayload & { actif?: boolean }>({
    nom: initial?.nom ?? '',
    prenom: initial?.prenom ?? '',
    fonction: initial?.fonction ?? '',
    qualification: initial?.qualification ?? 'MANOEUVRE',
    tauxJournalier: initial?.tauxJournalier ?? 0,
    dateEntree: initial?.dateEntree?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    dateSortie: initial?.dateSortie?.slice(0, 10) ?? '',
    telephone: initial?.telephone ?? '',
    notes: initial?.notes ?? '',
    actif: initial?.actif ?? true,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      initial?.id
        ? effectifApi.updateOuvrier(siteId, initial.id, form)
        : effectifApi.createOuvrier(siteId, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['effectif-ouvriers', siteId] });
      void qc.invalidateQueries({ queryKey: ['effectif-resume', siteId] });
      onClose();
    },
    onError: () => setError('Erreur lors de la sauvegarde'),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-navy mb-4">
          {initial?.id ? 'Modifier l\'ouvrier' : 'Ajouter un ouvrier'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nom *</label>
            <input className="input" value={form.nom} onChange={set('nom')} required />
          </div>
          <div>
            <label className="label">Prénom</label>
            <input className="input" value={form.prenom} onChange={set('prenom')} />
          </div>
          <div>
            <label className="label">Fonction</label>
            <input className="input" value={form.fonction} onChange={set('fonction')} placeholder="Ex: Maçon, Ferrailleur…" />
          </div>
          <div>
            <label className="label">Qualification</label>
            <select className="input" value={form.qualification} onChange={set('qualification')}>
              {QUALIFICATIONS.map((q) => (
                <option key={q} value={q}>{QUALIFICATION_LABELS[q]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Taux journalier (FCFA)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.tauxJournalier}
              onChange={(e) => setForm((f) => ({ ...f, tauxJournalier: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.telephone} onChange={set('telephone')} />
          </div>
          <div>
            <label className="label">Date d'entrée *</label>
            <input className="input" type="date" value={form.dateEntree} onChange={set('dateEntree')} required />
          </div>
          <div>
            <label className="label">Date de sortie</label>
            <input className="input" type="date" value={form.dateSortie} onChange={set('dateSortie')} />
          </div>
          {initial?.id && (
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="actif-toggle"
                type="checkbox"
                checked={form.actif}
                onChange={(e) => setForm((f) => ({ ...f, actif: e.target.checked }))}
                className="w-4 h-4 accent-cyan"
              />
              <label htmlFor="actif-toggle" className="text-sm text-slate-700">Actif sur ce chantier</label>
            </div>
          )}
          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={set('notes')} />
          </div>
        </div>
        {error && <p className="text-sm text-red mt-2">{error}</p>}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-secondary text-sm" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary text-sm"
            disabled={mutation.isPending || !form.nom || !form.dateEntree}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vue pointage mensuel ──────────────────────────────────────────────

interface PointageViewProps {
  siteId: string;
  mois: string;
}

function PointageView({ siteId, mois }: PointageViewProps) {
  const qc = useQueryClient();
  const [year, month] = mois.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const { data: ouvriers = [] } = useQuery({
    queryKey: ['effectif-ouvriers', siteId],
    queryFn: () => effectifApi.listOuvriers(siteId, true),
  });

  const { data: pointages = [] } = useQuery({
    queryKey: ['effectif-pointages', siteId, mois],
    queryFn: () => effectifApi.listPointages(siteId, mois),
  });

  const pointageMap = new Map(
    pointages.map((p) => [`${p.ouvrierId}-${p.date.slice(0, 10)}`, p]),
  );

  const toggle = useMutation({
    mutationFn: ({ ouvrierId, date, present, id }: { ouvrierId: string; date: string; present: boolean; id?: string }) => {
      if (!present && id) return effectifApi.deletePointage(siteId, id);
      return effectifApi.upsertPointage(siteId, { ouvrierId, date, present });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['effectif-pointages', siteId, mois] });
      void qc.invalidateQueries({ queryKey: ['effectif-resume', siteId] });
    },
  });

  if (ouvriers.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucun ouvrier actif. Ajoutez-en dans l'onglet Équipe.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white text-left px-3 py-2 font-semibold text-navy min-w-[160px] border-b border-slate-200">
              Ouvrier
            </th>
            {days.map((d) => {
              const dayOfWeek = new Date(year, month - 1, d).getDay();
              const isWe = dayOfWeek === 0 || dayOfWeek === 6;
              return (
                <th key={d} className={`px-1 py-2 text-center font-medium border-b border-slate-200 min-w-[28px] ${isWe ? 'text-slate-300' : 'text-slate-500'}`}>
                  {d}
                </th>
              );
            })}
            <th className="px-3 py-2 text-right font-semibold text-navy border-b border-slate-200 min-w-[60px]">Jours</th>
          </tr>
        </thead>
        <tbody>
          {ouvriers.map((o) => {
            let joursPresents = 0;
            return (
              <tr key={o.id} className="border-b border-slate-100 hover:bg-surface-0">
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-navy">
                  {o.nom} {o.prenom ?? ''}
                  {o.fonction && <div className="text-xs font-normal text-slate-400">{o.fonction}</div>}
                </td>
                {days.map((d) => {
                  const dateStr = `${mois}-${String(d).padStart(2, '0')}`;
                  const p = pointageMap.get(`${o.id}-${dateStr}`);
                  const present = p?.present ?? false;
                  if (present) joursPresents++;
                  const dayOfWeek = new Date(year, month - 1, d).getDay();
                  const isWe = dayOfWeek === 0 || dayOfWeek === 6;
                  return (
                    <td key={d} className={`text-center px-0.5 ${isWe ? 'bg-slate-50' : ''}`}>
                      <button
                        onClick={() => toggle.mutate({ ouvrierId: o.id, date: dateStr, present: !present, id: p?.id })}
                        className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                          present
                            ? 'bg-green text-white'
                            : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                        }`}
                        title={present ? 'Présent — cliquer pour marquer absent' : 'Absent — cliquer pour marquer présent'}
                      >
                        {present ? '✓' : '·'}
                      </button>
                    </td>
                  );
                })}
                <td className="text-right px-3 py-1.5 font-semibold text-navy">{joursPresents}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Vue résumé salaires ───────────────────────────────────────────────

function ResumeView({ siteId, mois }: { siteId: string; mois: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['effectif-resume', siteId, mois],
    queryFn: () => effectifApi.resume(siteId, mois),
  });

  if (isLoading) return <p className="text-sm text-slate-400 py-4">Chargement…</p>;
  if (!data || data.lignes.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucune donnée de pointage pour ce mois.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left px-3 py-2 font-semibold text-navy">Ouvrier</th>
            <th className="text-left px-3 py-2 font-semibold text-navy">Qualification</th>
            <th className="text-right px-3 py-2 font-semibold text-navy">Taux/j</th>
            <th className="text-right px-3 py-2 font-semibold text-navy">Jours</th>
            <th className="text-right px-3 py-2 font-semibold text-navy">Heures</th>
            <th className="text-right px-3 py-2 font-semibold text-navy">Salaire HT</th>
          </tr>
        </thead>
        <tbody>
          {data.lignes.map((l) => (
            <tr key={l.ouvrierId} className="border-b border-slate-100 hover:bg-surface-0">
              <td className="px-3 py-2 font-medium text-navy">
                {l.nom} {l.prenom ?? ''}
                {l.fonction && <span className="ml-1 text-xs text-slate-400">({l.fonction})</span>}
              </td>
              <td className="px-3 py-2 text-slate-600">{QUALIFICATION_LABELS[l.qualification]}</td>
              <td className="px-3 py-2 text-right text-slate-600">{formatFCFA(l.tauxJournalier)}</td>
              <td className="px-3 py-2 text-right font-medium text-navy">{l.joursPresents}</td>
              <td className="px-3 py-2 text-right text-slate-600">{l.heuresTotales}h</td>
              <td className="px-3 py-2 text-right font-semibold text-green">{formatFCFA(l.salaireHt)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-surface-0">
            <td colSpan={3} className="px-3 py-2 font-semibold text-navy">Total masse salariale</td>
            <td className="px-3 py-2 text-right font-bold text-navy">{data.totalJours} j</td>
            <td />
            <td className="px-3 py-2 text-right font-bold text-navy">{formatFCFA(data.totalSalaire)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────

type SubTab = 'equipe' | 'pointage' | 'salaires';

interface EffectifTabProps {
  siteId: string;
}

export function EffectifTab({ siteId }: EffectifTabProps) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('equipe');
  const [mois, setMois] = useState(currentMois);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ouvrier | null>(null);

  const { data: ouvriers = [], isLoading } = useQuery({
    queryKey: ['effectif-ouvriers', siteId],
    queryFn: () => effectifApi.listOuvriers(siteId),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => effectifApi.removeOuvrier(siteId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['effectif-ouvriers', siteId] }),
  });

  const actifs = ouvriers.filter((o) => o.actif);
  const inactifs = ouvriers.filter((o) => !o.actif);

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'equipe', label: `Équipe (${actifs.length})` },
    { key: 'pointage', label: 'Feuille de pointage' },
    { key: 'salaires', label: 'Résumé salaires' },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {SUB_TABS.map((st) => (
          <button
            key={st.key}
            onClick={() => setSubTab(st.key)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              subTab === st.key
                ? 'border-cyan text-cyan-dark font-medium'
                : 'border-transparent text-slate-600 hover:text-navy'
            }`}
          >
            {st.label}
          </button>
        ))}
        {/* Sélecteur mois (pointage + salaires) */}
        {(subTab === 'pointage' || subTab === 'salaires') && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            <label className="text-xs text-slate-500">Mois</label>
            <input
              type="month"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cyan/40"
            />
          </div>
        )}
      </div>

      {/* Contenu */}
      {subTab === 'equipe' && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy">Ouvriers & personnel</h3>
            <button className="btn-primary text-sm" onClick={() => { setEditing(null); setShowForm(true); }}>
              + Ajouter
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : actifs.length === 0 && inactifs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Aucun ouvrier enregistré. Cliquez sur "Ajouter" pour commencer.
            </p>
          ) : (
            <>
              {actifs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-semibold text-navy">Nom</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Fonction</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Qualification</th>
                        <th className="text-right px-3 py-2 font-semibold text-navy">Taux/jour</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Date entrée</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Tél.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {actifs.map((o) => (
                        <tr key={o.id} className="border-b border-slate-100 hover:bg-surface-0">
                          <td className="px-3 py-2 font-medium text-navy">
                            {o.nom} {o.prenom ?? ''}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{o.fonction ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{QUALIFICATION_LABELS[o.qualification]}</td>
                          <td className="px-3 py-2 text-right font-medium text-navy">{formatFCFA(o.tauxJournalier)}</td>
                          <td className="px-3 py-2 text-slate-500">{o.dateEntree.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-slate-500">{o.telephone ?? '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="text-xs text-cyan-dark hover:underline mr-3"
                              onClick={() => { setEditing(o); setShowForm(true); }}
                            >
                              Modifier
                            </button>
                            <button
                              className="text-xs text-red hover:underline"
                              onClick={() => { if (confirm(`Supprimer ${o.nom} ?`)) removeMutation.mutate(o.id); }}
                            >
                              Suppr.
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {inactifs.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-slate-500 hover:text-navy py-1">
                    {inactifs.length} ouvrier{inactifs.length > 1 ? 's' : ''} inactif{inactifs.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-2">
                    {inactifs.map((o) => (
                      <li key={o.id} className="text-slate-400 flex items-center justify-between py-1 border-b border-slate-100">
                        <span>{o.nom} {o.prenom ?? ''} — {o.fonction ?? 'Sans fonction'}</span>
                        <button
                          className="text-xs text-cyan-dark hover:underline"
                          onClick={() => { setEditing(o); setShowForm(true); }}
                        >
                          Modifier
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'pointage' && (
        <div className="card">
          <p className="text-xs text-slate-400 mb-3">
            Cliquez sur une case pour marquer présent (vert ✓) ou absent (gris ·).
          </p>
          <PointageView siteId={siteId} mois={mois} />
        </div>
      )}

      {subTab === 'salaires' && (
        <div className="card">
          <ResumeView siteId={siteId} mois={mois} />
        </div>
      )}

      {showForm && (
        <OuvrierForm
          siteId={siteId}
          initial={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

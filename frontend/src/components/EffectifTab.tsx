import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { effectifApi, type CreateOuvrierPayload } from '@/api/endpoints';
import { QUALIFICATION_LABELS, type Ouvrier, type Pointage, type QualificationOuvrier } from '@/api/types';
import { formatFCFA, formatJourMois } from '@/lib/format';
import {
  MUT_POINTAGE_UPSERT,
  MUT_POINTAGE_DELETE,
  type PointageUpsertVars,
  type PointageDeleteVars,
} from '@/lib/offline';

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
    matricule: initial?.matricule ?? '',
    prenom: initial?.prenom ?? '',
    fonction: initial?.fonction ?? '',
    qualification: initial?.qualification ?? 'MANOEUVRE',
    salaireBase: initial?.salaireBase ?? 0,
    tauxPanier: initial?.tauxPanier ?? 0,
    tauxTransport: initial?.tauxTransport ?? 0,
    forfaitMensuel: initial?.forfaitMensuel ?? false,
    exonereCotisations: initial?.exonereCotisations ?? false,
    hsForfaitaire: initial?.hsForfaitaire ?? 0,
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
    onError: (e: unknown) => {
      // Remonter le motif exact renvoyé par l'API plutôt qu'un message
      // générique, qui masque la cause réelle du refus.
      const msg = (e as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(' · ') : msg || 'Erreur lors de la sauvegarde');
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const tauxHoraire = form.salaireBase > 0 ? Math.round(form.salaireBase / 173.33) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-navy mb-4">
          {initial?.id ? 'Modifier le salarié' : 'Ajouter un salarié'}
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
            <label className="label">Matricule</label>
            <input className="input" value={form.matricule} onChange={set('matricule')} placeholder="Ex: 2405, PST1…" />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.telephone} onChange={set('telephone')} />
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
          <div className="col-span-2">
            <label className="label">Salaire mensuel brut (FCFA)</label>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={form.salaireBase}
              onChange={(e) => setForm((f) => ({ ...f, salaireBase: Number(e.target.value) }))}
            />
            {tauxHoraire > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                → Taux horaire : {formatFCFA(tauxHoraire)} / h (base 173,33 h/mois)
              </p>
            )}
          </div>
          <div>
            <label className="label">Prime panier (FCFA/jour)</label>
            <input
              className="input"
              type="number"
              min={0}
              step={500}
              value={form.tauxPanier}
              onChange={(e) => setForm((f) => ({ ...f, tauxPanier: Number(e.target.value) }))}
              placeholder="0 ou 1000"
            />
          </div>
          <div>
            <label className="label">Prime transport (FCFA/jour)</label>
            <input
              className="input"
              type="number"
              min={0}
              step={500}
              value={form.tauxTransport}
              onChange={(e) => setForm((f) => ({ ...f, tauxTransport: Number(e.target.value) }))}
              placeholder="0 ou 1000"
            />
          </div>
          {/* Régime de rémunération */}
          <div className="col-span-2 border-t border-slate-100 pt-3 mt-1 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.forfaitMensuel}
                onChange={(e) => setForm((f) => ({ ...f, forfaitMensuel: e.target.checked }))}
                className="w-4 h-4 accent-cyan"
              />
              Rémunéré au mois de 30 jours calendaires (forfait)
            </label>
            <p className="text-xs text-slate-400 -mt-1 ml-6">
              Conducteurs, encadrement, gardiens : salaire proratisé sur 30 j
              au lieu d'un calcul horaire.
            </p>

            {form.forfaitMensuel && (
              <div className="ml-6">
                <label className="label">Heures supplémentaires forfaitaires (FCFA/mois)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={5000}
                  value={form.hsForfaitaire}
                  onChange={(e) => setForm((f) => ({ ...f, hsForfaitaire: Number(e.target.value) }))}
                  placeholder="0"
                />
                <p className="text-xs text-slate-400 mt-0.5">
                  Montant convenu, versé en plus du salaire. Laisser à 0 si le
                  salarié n'en bénéficie pas.
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.exonereCotisations}
                onChange={(e) => setForm((f) => ({ ...f, exonereCotisations: e.target.checked }))}
                className="w-4 h-4 accent-cyan"
              />
              Exonéré de cotisations sociales (prestataire, stagiaire)
            </label>
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

// ── Popover saisie heures d'un jour ──────────────────────────────────

interface CellEditProps {
  ouvrierId: string;
  siteId: string;
  date: string;
  mois: string;
  pointage?: Pointage;
  onClose: () => void;
}

function CellEditPopover({ ouvrierId, siteId, date, mois, pointage, onClose }: CellEditProps) {
  const [heures, setHeures] = useState(pointage?.heures ?? 8);
  const [heuresNuit, setHeuresNuit] = useState(pointage?.heuresNuit ?? 0);
  const [jourFerie, setJourFerie] = useState(pointage?.jourFerie ?? false);

  // Mutations résumables (hors-ligne) — logique dans lib/offline.ts.
  const upsert = useMutation<Pointage, unknown, PointageUpsertVars>({
    mutationKey: MUT_POINTAGE_UPSERT,
  });
  const del = useMutation<unknown, unknown, PointageDeleteVars>({
    mutationKey: MUT_POINTAGE_DELETE,
  });

  // Fermeture immédiate : la saisie est appliquée de façon optimiste puis
  // synchronisée en arrière-plan (ou mise en file d'attente si hors-ligne).
  const save = () => {
    if (heures <= 0) {
      if (pointage?.id) del.mutate({ siteId, mois, id: pointage.id, ouvrierId, date });
      onClose();
      return;
    }
    upsert.mutate({ siteId, mois, payload: { ouvrierId, date, present: true, heures, heuresNuit, jourFerie } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-4 w-60" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-navy mb-3">{date}</p>
        <div className="space-y-2">
          <div>
            <label className="label text-xs">Heures travaillées (0 = absent)</label>
            <input
              className="input text-sm"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={heures}
              onChange={(e) => setHeures(Number(e.target.value))}
              autoFocus
            />
          </div>
          <div>
            <label className="label text-xs">Dont heures de nuit (22h–5h)</label>
            <input
              className="input text-sm"
              type="number"
              min={0}
              max={Math.min(12, heures)}
              step={0.5}
              value={heuresNuit}
              onChange={(e) => setHeuresNuit(Number(e.target.value))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={jourFerie}
              onChange={(e) => setJourFerie(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            Dimanche / Jour férié (+60 %)
          </label>
        </div>
        <div className="flex gap-2 mt-3 justify-end">
          <button className="btn-secondary text-xs py-1" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary text-xs py-1"
            onClick={save}
            disabled={upsert.isPending || del.isPending}
          >
            OK
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
  search: string;
}

function PointageView({ siteId, mois, search }: PointageViewProps) {
  const [year, month] = mois.split('-').map(Number);
  const prevYear   = month === 1 ? year - 1 : year;
  const prevMonth  = month === 1 ? 12 : month - 1;
  const daysInPrev = new Date(prevYear, prevMonth, 0).getDate();

  // Période 21 du mois précédent → 20 du mois courant
  type PDay = { dateStr: string; day: number; month: number; year: number };
  const periodDays: PDay[] = [];
  for (let d = 21; d <= daysInPrev; d++) {
    periodDays.push({
      dateStr: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d, month: prevMonth, year: prevYear,
    });
  }
  for (let d = 1; d <= 20; d++) {
    periodDays.push({
      dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d, month, year,
    });
  }

  const [editing, setEditing] = useState<{ ouvrierId: string; date: string; mois: string; pointage?: Pointage } | null>(null);

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

  const q = search.toLowerCase();
  const filtered = ouvriers.filter((o) =>
    !q ||
    o.nom.toLowerCase().includes(q) ||
    (o.prenom ?? '').toLowerCase().includes(q) ||
    (o.matricule ?? '').toLowerCase().includes(q) ||
    (o.fonction ?? '').toLowerCase().includes(q)
  );

  if (ouvriers.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucun ouvrier actif. Ajoutez-en dans l'onglet Équipe.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            {/* Ligne d'entête des mois */}
            <tr className="text-[9px] text-slate-400">
              <th className="sticky left-0 bg-white" />
              <th colSpan={daysInPrev - 20} className="text-center font-medium pb-0 border-b border-slate-100">
                {new Date(prevYear, prevMonth - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()} {prevYear !== year ? prevYear : ''}
              </th>
              <th colSpan={20} className="text-center font-medium pb-0 border-b border-slate-100 border-l-2 border-l-cyan/40">
                {new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()} {year}
              </th>
              <th />
            </tr>
            <tr>
              <th className="sticky left-0 bg-white text-left px-3 py-2 font-semibold text-navy min-w-[180px] border-b border-slate-200">
                Salarié
              </th>
              {periodDays.map(({ dateStr, day, month: m, year: y }) => {
                const dow = new Date(y, m - 1, day).getDay();
                const isSun = dow === 0;
                const isSat = dow === 6;
                const isFirst = m === month && day === 1;
                return (
                  <th key={dateStr} className={`px-0.5 py-2 text-center font-medium border-b border-slate-200 min-w-[30px] ${isFirst ? 'border-l-2 border-l-cyan/40' : ''} ${isSun ? 'bg-red-50 text-red-300' : isSat ? 'bg-slate-50 text-slate-400' : 'text-slate-500'}`}>
                    <div>{day}</div>
                    <div className="text-[9px] font-normal">{'DLMMJVS'[dow]}</div>
                  </th>
                );
              })}
              <th className="px-2 py-2 text-right font-semibold text-navy border-b border-slate-200 min-w-[48px]">H.tot</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              let hTotal = 0;
              return (
                <tr key={o.id} className="border-b border-slate-100 hover:bg-surface-0">
                  <td className="sticky left-0 bg-white px-3 py-1.5">
                    <div className="font-medium text-navy text-xs">{o.nom} {o.prenom ?? ''}</div>
                    {o.matricule && <div className="text-[10px] text-cyan-dark font-mono">{o.matricule}</div>}
                    {o.fonction && <div className="text-[10px] text-slate-400">{o.fonction}</div>}
                  </td>
                  {periodDays.map(({ dateStr, day, month: m, year: y }) => {
                    const p = pointageMap.get(`${o.id}-${dateStr}`);
                    const h = p?.present ? Number(p.heures) : 0;
                    if (h > 0) hTotal += h;
                    const dow = new Date(y, m - 1, day).getDay();
                    const isSun = dow === 0;
                    const isSat = dow === 6;
                    const isFerie = p?.jourFerie ?? false;
                    const hasNuit = (p?.heuresNuit ?? 0) > 0;
                    const isFirst = m === month && day === 1;

                    let bg = isSun ? 'bg-red-50' : isSat ? 'bg-slate-50' : '';
                    let cellClass = 'text-slate-200';
                    if (h > 0) {
                      if (isFerie) { bg = 'bg-amber-50'; cellClass = 'bg-amber-400 text-white'; }
                      else         { cellClass = 'bg-green text-white'; }
                    }

                    return (
                      <td key={dateStr} className={`text-center px-0 py-0.5 ${bg} ${isFirst ? 'border-l-2 border-l-cyan/40' : ''}`}>
                        <button
                          onClick={() => setEditing({ ouvrierId: o.id, date: dateStr, mois, pointage: p })}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors relative ${cellClass}`}
                          title={h > 0 ? `${h}h${isFerie ? ' (Ferie)' : ''}${hasNuit ? ` dont ${p?.heuresNuit}h nuit` : ''} — Cliquer pour modifier` : 'Absent — Cliquer pour saisir les heures'}
                        >
                          {h > 0 ? h : '·'}
                          {hasNuit && h > 0 && <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-right px-2 py-1.5 font-semibold text-navy tabular-nums">
                    {hTotal > 0 ? `${hTotal}h` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-4 text-[10px] text-slate-400">
        <span><span className="inline-block w-2.5 h-2.5 rounded bg-green mr-1" />Jour normal</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded bg-amber-400 mr-1" />Férie/Dim (+60%)</span>
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1" />Nuit (22h-5h)</span>
      </div>

      {editing && (
        <CellEditPopover
          siteId={siteId}
          ouvrierId={editing.ouvrierId}
          date={editing.date}
          mois={editing.mois}
          pointage={editing.pointage}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ── Vue résumé salaires sénégalais ────────────────────────────────────

function ResumeView({ siteId, mois, search }: { siteId: string; mois: string; search: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['effectif-resume', siteId, mois],
    queryFn: () => effectifApi.resume(siteId, mois),
  });

  if (isLoading) return <p className="text-sm text-slate-400 py-4">Chargement…</p>;
  if (!data || data.lignes.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucune donnée de pointage pour ce mois.</p>;
  }

  const q = search.toLowerCase();
  const lignes = data.lignes.filter((l) =>
    !q ||
    l.nom.toLowerCase().includes(q) ||
    (l.prenom ?? '').toLowerCase().includes(q) ||
    (l.matricule ?? '').toLowerCase().includes(q) ||
    (l.fonction ?? '').toLowerCase().includes(q)
  );

  const totalBrut             = lignes.reduce((a, l) => a + l.totalBrut, 0);
  const totalSalaireNet        = lignes.reduce((a, l) => a + l.salaireNet, 0);
  const totalChargesPatronales = lignes.reduce((a, l) => a + l.totalChargesPatronales, 0);
  const totalCoutEmployeur     = lignes.reduce((a, l) => a + l.coutTotalEmployeur, 0);

  return (
    <div className="overflow-x-auto">
      <p className="text-xs text-slate-400 mb-3">
        {(() => {
          const [y, m] = mois.split('-').map(Number);
          const pY = m === 1 ? y - 1 : y;
          const pM = m === 1 ? 12 : m - 1;
          const label = (yr: number, mo: number, d: number) =>
            `${d} ${new Date(yr, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long' })} ${yr}`;
          return `Période du ${label(pY, pM, 21)} au ${label(y, m, 20)} — Décret n° 70-184 — Taux = Salaire / 173,33 h`;
        })()}
      </p>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-surface-0 text-slate-500">
            <th className="text-left px-3 py-2 font-semibold text-navy">Salarié</th>
            <th className="text-right px-2 py-2">S.base</th>
            <th className="text-right px-2 py-2">Taux/h</th>
            <th className="text-right px-2 py-2">J.prés.</th>
            <th className="text-right px-2 py-2">H.norm</th>
            <th className="text-right px-2 py-2 text-blue-600">HS +15%</th>
            <th className="text-right px-2 py-2 text-orange-500">HS +40%</th>
            <th className="text-right px-2 py-2 text-amber-600">H.férié</th>
            <th className="text-right px-2 py-2 text-indigo-500">Nuit</th>
            <th className="text-right px-2 py-2 text-slate-500">Primes</th>
            <th className="text-right px-3 py-2 font-semibold text-green">Total brut</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const isOpen = expanded === l.ouvrierId;
            const totalPrimes = (l.primePanier ?? 0) + (l.primeTransport ?? 0);
            const hasOt = l.heuresHs15 > 0 || l.heuresHs40 > 0 || l.heuresFerie > 0 || l.heuresNuit > 0 || totalPrimes > 0;
            return (
              <>
                <tr
                  key={l.ouvrierId}
                  className={`border-b border-slate-100 hover:bg-surface-0 cursor-pointer ${isOpen ? 'bg-slate-50' : ''}`}
                  onClick={() => setExpanded(isOpen ? null : l.ouvrierId)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-navy">{l.nom} {l.prenom ?? ''}</div>
                    {l.matricule && <div className="text-[10px] font-mono text-cyan-dark">{l.matricule}</div>}
                    {l.fonction && <div className="text-[10px] text-slate-400">{l.fonction}</div>}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{l.salaireBase > 0 ? formatFCFA(l.salaireBase) : '—'}</td>
                  <td className="px-2 py-2 text-right text-slate-500 tabular-nums">
                    {l.forfaitMensuel
                      ? <span className="text-[10px] text-purple-600 font-medium">forfait 30 j</span>
                      : l.tauxHoraire > 0 ? `${l.tauxHoraire.toFixed(4)} F` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-medium text-navy tabular-nums">{l.joursPresents}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {l.forfaitMensuel ? `${l.heuresNormales} j` : `${l.heuresNormales}h`}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${l.heuresHs15 > 0 ? 'text-blue-600 font-medium' : 'text-slate-300'}`}>{l.heuresHs15 > 0 ? `${l.heuresHs15}h` : '—'}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${l.heuresHs40 > 0 ? 'text-orange-500 font-medium' : 'text-slate-300'}`}>{l.heuresHs40 > 0 ? `${l.heuresHs40}h` : '—'}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${l.heuresFerie > 0 ? 'text-amber-600 font-medium' : 'text-slate-300'}`}>{l.heuresFerie > 0 ? `${l.heuresFerie}h` : '—'}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${l.heuresNuit > 0 || l.heuresNuitFerie > 0 ? 'text-indigo-500 font-medium' : 'text-slate-300'}`}>
                    {l.heuresNuit + l.heuresNuitFerie > 0 ? `${l.heuresNuit + l.heuresNuitFerie}h` : '—'}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${totalPrimes > 0 ? 'text-teal-600 font-medium' : 'text-slate-300'}`}>
                    {totalPrimes > 0 ? formatFCFA(totalPrimes) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-green tabular-nums">
                    {l.totalBrut > 0 ? formatFCFA(l.totalBrut) : '—'}
                    {hasOt && <span className="ml-1 text-[9px] text-slate-400">▾</span>}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${l.ouvrierId}-detail`} className="bg-slate-50 border-b border-slate-200">
                    <td colSpan={11} className="px-6 py-3">
                      {l.sourceRecap && (
                        <div className="mb-2 max-w-lg rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-800">
                          📋 Repris du récapitulatif de paie du mois — pas de pointage
                          journalier saisi. Les totaux d'heures font foi tels quels.
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs max-w-lg">
                        {/* Taux unitaires arrondis à l'FCFA (calculés depuis tauxHoraire à 4 déc.) */}
                        {(() => {
                          const fmt4 = (n: number) => n.toFixed(4);
                          // Au forfait : rémunération proratisée sur 30 jours
                          // calendaires, sans décompte horaire.
                          if (l.forfaitMensuel) {
                            return <>
                              <div className="text-slate-500">
                                Forfait mensuel ({l.heuresNormales} j / 30 × {formatFCFA(l.salaireBase)})
                              </div>
                              <div className="text-right font-medium">{formatFCFA(l.montantNormal)}</div>
                              {(l.hsForfaitaire ?? 0) > 0 && <>
                                <div className="text-blue-600">Heures suppl. forfaitaires</div>
                                <div className="text-right font-medium text-blue-600">{formatFCFA(l.hsForfaitaire)}</div>
                              </>}
                            </>;
                          }
                          const th    = fmt4(l.tauxHoraire);
                          const th15  = fmt4(l.tauxHoraire * 1.15);
                          const th40  = fmt4(l.tauxHoraire * 1.40);
                          const thFe  = fmt4(l.tauxHoraire * 1.60);
                          const thN   = fmt4(l.tauxHoraire * 0.60);
                          const thNFe = fmt4(l.tauxHoraire * 1.00);
                          return <>
                            <div className="text-slate-500">H. normales ({l.heuresNormales}h × {th} F/h)</div>
                            <div className="text-right font-medium">{formatFCFA(l.montantNormal)}</div>
                            {l.heuresHs15 > 0 && <>
                              <div className="text-blue-600">HS 41e–48e ({l.heuresHs15}h × {th15} F/h · +15 %)</div>
                              <div className="text-right font-medium text-blue-600">{formatFCFA(l.montantHs15)}</div>
                            </>}
                            {l.heuresHs40 > 0 && <>
                              <div className="text-orange-500">HS &gt;48e ({l.heuresHs40}h × {th40} F/h · +40 %)</div>
                              <div className="text-right font-medium text-orange-500">{formatFCFA(l.montantHs40)}</div>
                            </>}
                            {l.heuresFerie > 0 && <>
                              <div className="text-amber-600">Fériés/dim. ({l.heuresFerie}h × {thFe} F/h · +60 %)</div>
                              <div className="text-right font-medium text-amber-600">{formatFCFA(l.montantFerie)}</div>
                            </>}
                            {(l.heuresHs100 ?? 0) > 0 && <>
                              <div className="text-red-600">H 100 % ({l.heuresHs100}h × {fmt4(l.tauxHoraire * 2)} F/h · taux double)</div>
                              <div className="text-right font-medium text-red-600">{formatFCFA(l.montantHs100)}</div>
                            </>}
                            {l.heuresNuit > 0 && <>
                              <div className="text-indigo-500">Suppl. nuit semaine ({l.heuresNuit}h × {thN} F/h · +60 %)</div>
                              <div className="text-right font-medium text-indigo-500">{formatFCFA(l.majorationNuit)}</div>
                            </>}
                            {l.heuresNuitFerie > 0 && <>
                              <div className="text-indigo-700">Suppl. nuit fériée ({l.heuresNuitFerie}h × {thNFe} F/h · +100 %)</div>
                              <div className="text-right font-medium text-indigo-700">{formatFCFA(l.majorationNuitFerie)}</div>
                            </>}
                          </>;
                        })()}
                        {(l.primePanier ?? 0) > 0 && <>
                          <div className="text-teal-600">Prime panier — jours ≥11h ({l.joursAvecPanier}j × {formatFCFA(l.tauxPanier)}/j)</div>
                          <div className="text-right font-medium text-teal-600">{formatFCFA(l.primePanier)}</div>
                        </>}
                        {(l.primeTransport ?? 0) > 0 && <>
                          <div className="text-teal-600">Prime transport ({l.joursPresents}j × {formatFCFA(l.tauxTransport)}/j)</div>
                          <div className="text-right font-medium text-teal-600">{formatFCFA(l.primeTransport)}</div>
                        </>}
                        <div className="font-semibold text-navy border-t border-slate-200 mt-1 pt-1">Total brut</div>
                        <div className="text-right font-bold text-green border-t border-slate-200 mt-1 pt-1">{formatFCFA(l.totalBrut)}</div>

                        {/* ── Justification semaine par semaine ── */}
                        {(l.detailSemaines ?? []).length > 0 && (
                          <div className="col-span-2 mt-3">
                            <div className="pb-0.5 text-[10px] text-slate-400 uppercase tracking-wide font-semibold border-b border-slate-200">
                              Détail par semaine — l'arrondi s'applique à chaque semaine
                            </div>
                            <table className="w-full mt-1 text-[11px] tabular-nums">
                              <thead>
                                <tr className="text-slate-400">
                                  <th className="text-left font-medium py-0.5">Semaine</th>
                                  <th className="text-right font-medium">Norm.</th>
                                  <th className="text-right font-medium text-blue-600">+15 %</th>
                                  <th className="text-right font-medium text-orange-500">+40 %</th>
                                  <th className="text-right font-medium text-amber-600">Férié</th>
                                  <th className="text-right font-medium">Montant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {l.detailSemaines.map((s) => (
                                  <tr key={s.semaine} className="border-t border-slate-100">
                                    <td className="py-0.5 text-slate-500 whitespace-nowrap">
                                      {formatJourMois(s.debut)} – {formatJourMois(s.fin)}
                                    </td>
                                    <td className="text-right">{s.heuresNormales > 0 ? `${s.heuresNormales}h` : '—'}</td>
                                    <td className="text-right text-blue-600">{s.heuresHs15 > 0 ? `${s.heuresHs15}h` : '—'}</td>
                                    <td className="text-right text-orange-500">{s.heuresHs40 > 0 ? `${s.heuresHs40}h` : '—'}</td>
                                    <td className="text-right text-amber-600">{s.heuresFerie > 0 ? `${s.heuresFerie}h` : '—'}</td>
                                    <td className="text-right font-medium text-navy">{formatFCFA(s.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-slate-300 font-semibold text-navy">
                                  <td className="py-0.5">Total heures</td>
                                  <td className="text-right">{l.heuresNormales}h</td>
                                  <td className="text-right text-blue-600">{l.heuresHs15 > 0 ? `${l.heuresHs15}h` : '—'}</td>
                                  <td className="text-right text-orange-500">{l.heuresHs40 > 0 ? `${l.heuresHs40}h` : '—'}</td>
                                  <td className="text-right text-amber-600">{l.heuresFerie > 0 ? `${l.heuresFerie}h` : '—'}</td>
                                  <td className="text-right">
                                    {formatFCFA(l.montantNormal + l.montantHs15 + l.montantHs40 + l.montantFerie)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}

                        {/* ── Retenues salariales ── */}
                        <div className="col-span-2 mt-3 pb-0.5 text-[10px] text-slate-400 uppercase tracking-wide font-semibold border-b border-slate-200">Retenues salariales</div>
                        <div className="text-red-500">IPRES Rég. Général (5,6 %)</div>
                        <div className="text-right font-medium text-red-500">-{formatFCFA(l.retIPRES)}</div>
                        <div className="text-red-500">Cotisation IPM</div>
                        <div className="text-right font-medium text-red-500">-{formatFCFA(l.retIPM)}</div>
                        <div className="text-red-500">TRIMF</div>
                        <div className="text-right font-medium text-red-500">-{formatFCFA(l.retTRIMF)}</div>
                        {l.retIRPP > 0 && <>
                          <div className="text-red-500">IRPP (Impôt sur le revenu)</div>
                          <div className="text-right font-medium text-red-500">-{formatFCFA(l.retIRPP)}</div>
                        </>}
                        <div className="font-bold text-navy border-t border-slate-200 mt-1 pt-1">Salaire net</div>
                        <div className="text-right font-bold text-navy border-t border-slate-200 mt-1 pt-1">{formatFCFA(l.salaireNet)}</div>

                        {/* ── Charges patronales ── */}
                        <div className="col-span-2 mt-3 pb-0.5 text-[10px] text-slate-400 uppercase tracking-wide font-semibold border-b border-slate-200">Charges patronales</div>
                        <div className="text-slate-500">IPRES employeur (8,4 %)</div>
                        <div className="text-right text-slate-500">{formatFCFA(l.charIPRES)}</div>
                        <div className="text-slate-500">CSS Allocations familiales (7 % du plafond)</div>
                        <div className="text-right text-slate-500">{formatFCFA(l.charCssAF)}</div>
                        <div className="text-slate-500">CSS Accidents du travail (5 % du plafond)</div>
                        <div className="text-right text-slate-500">{formatFCFA(l.charCssAT)}</div>
                        <div className="text-slate-500">CFCE (3 %)</div>
                        <div className="text-right text-slate-500">{formatFCFA(l.charCFCE)}</div>
                        <div className="text-slate-500">IPM employeur</div>
                        <div className="text-right text-slate-500">{formatFCFA(l.charIPM)}</div>
                        <div className="font-medium text-slate-600 border-t border-slate-200 mt-1 pt-1">Total charges</div>
                        <div className="text-right font-medium text-slate-600 border-t border-slate-200 mt-1 pt-1">{formatFCFA(l.totalChargesPatronales)}</div>
                        <div className="font-bold text-slate-700 mt-0.5">Coût total employeur</div>
                        <div className="text-right font-bold text-slate-700 mt-0.5">{formatFCFA(l.coutTotalEmployeur)}</div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-surface-0">
            <td colSpan={3} className="px-3 py-2 font-semibold text-navy">Masse salariale brute</td>
            <td className="px-2 py-2 text-right font-bold text-navy tabular-nums">{data.totalJours} j</td>
            <td colSpan={6} />
            <td className="px-3 py-2 text-right font-bold text-green tabular-nums text-sm">{formatFCFA(totalBrut)}</td>
          </tr>
        </tfoot>
      </table>

      {/* ── Récap masse salariale ── */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-green/10 rounded-lg border border-green/20">
          <div className="text-slate-500 mb-0.5">Salaire net total</div>
          <div className="font-bold text-navy tabular-nums text-sm">{formatFCFA(totalSalaireNet)}</div>
          <div className="text-slate-400 mt-0.5">Retenues : -{formatFCFA(totalBrut - totalSalaireNet)}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-slate-500 mb-0.5">Charges patronales</div>
          <div className="font-bold text-slate-700 tabular-nums text-sm">{formatFCFA(totalChargesPatronales)}</div>
          <div className="text-slate-400 mt-0.5">IPRES + CSS AF/AT + CFCE + IPM</div>
        </div>
        <div className="p-3 bg-navy/5 rounded-lg border border-navy/10">
          <div className="text-slate-500 mb-0.5">Coût total employeur</div>
          <div className="font-bold text-navy tabular-nums text-sm">{formatFCFA(totalCoutEmployeur)}</div>
          <div className="text-slate-400 mt-0.5">Brut {formatFCFA(totalBrut)} + charges</div>
        </div>
      </div>
    </div>
  );
}

// ── Récapitulatif d'effectif : productif / non productif ──────────────

function RecapEffectifView({ siteId, mois }: { siteId: string; mois: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['effectif-recap', siteId, mois],
    queryFn: () => effectifApi.recapEffectif(siteId, mois),
  });

  if (isLoading) return <p className="text-sm text-slate-400 py-4">Chargement…</p>;
  if (!data || data.total === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Aucun effectif enregistré pour ce mois.</p>;
  }

  const maxTotal = Math.max(...data.evolution.map((m) => m.total), 1);
  const evo = data.evolution.slice(-14);

  const Colonne = ({ titre, lignes, total, couleur }: {
    titre: string; lignes: typeof data.productifs; total: number; couleur: string;
  }) => (
    <div className="card p-0 overflow-hidden">
      <div className={`px-4 py-2.5 ${couleur} text-white flex items-baseline justify-between`}>
        <span className="font-semibold text-sm">{titre}</span>
        <span className="text-lg font-bold tabular-nums">{total}</span>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {lignes.map((l) => (
            <tr key={l.fonction} className="hover:bg-surface-0">
              <td className="px-4 py-1.5 text-slate-700">{l.fonction}</td>
              <td className="px-4 py-1.5 text-right font-medium text-navy tabular-nums w-16">{l.nb}</td>
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr><td className="px-4 py-3 text-slate-400 text-xs">Aucun</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Chiffres clés */}
      <div className="grid grid-cols-3 gap-3">
        <div className="kpi-card">
          <span className="text-xs uppercase tracking-wide text-slate-500">Effectif total</span>
          <span className="text-2xl font-bold text-navy">{data.total}</span>
        </div>
        <div className="kpi-card">
          <span className="text-xs uppercase tracking-wide text-slate-500">Productifs</span>
          <span className="text-2xl font-bold text-green">{data.totalProductifs}</span>
          <span className="text-xs text-slate-400">{data.pctProductifs} % de l'effectif</span>
        </div>
        <div className="kpi-card">
          <span className="text-xs uppercase tracking-wide text-slate-500">Non productifs</span>
          <span className="text-2xl font-bold text-orange">{data.totalNonProductifs}</span>
          <span className="text-xs text-slate-400">{(100 - data.pctProductifs).toFixed(1)} % de l'effectif</span>
        </div>
      </div>

      {/* Ventilation par fonction */}
      <div className="grid md:grid-cols-2 gap-4">
        <Colonne titre="Personnel productif" lignes={data.productifs} total={data.totalProductifs} couleur="bg-green" />
        <Colonne titre="Personnel non productif" lignes={data.nonProductifs} total={data.totalNonProductifs} couleur="bg-orange" />
      </div>

      {/* Évolution mensuelle */}
      <div className="card">
        <h3 className="font-semibold text-navy text-sm mb-3">Évolution de l'effectif</h3>
        <div className="flex items-end gap-1 h-32 mb-1">
          {evo.map((m) => (
            <div key={m.mois} className="flex-1 flex flex-col justify-end group relative" title={`${m.mois} — ${m.total} personnes (${m.productifs} productifs, ${m.nonProductifs} non productifs)`}>
              <div className="bg-orange rounded-t-sm" style={{ height: `${(m.nonProductifs / maxTotal) * 100}%` }} />
              <div className="bg-green" style={{ height: `${(m.productifs / maxTotal) * 100}%` }} />
              <div className="absolute -top-5 left-0 right-0 text-center text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                {m.total}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 text-[9px] text-slate-400">
          {evo.map((m) => (
            <div key={m.mois} className="flex-1 text-center">{m.mois.slice(5)}/{m.mois.slice(2, 4)}</div>
          ))}
        </div>
        <div className="flex gap-4 text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-green mr-1" />Productifs</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded bg-orange mr-1" />Non productifs</span>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Productif = main-d'œuvre directe (maçons, manœuvres, menuisiers, chefs
        d'équipe, conducteurs d'engins). Non productif = encadrement, études,
        qualité, sécurité, maintenance et gardiennage.
      </p>
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────

type SubTab = 'equipe' | 'pointage' | 'salaires' | 'recap';

interface EffectifTabProps {
  siteId: string;
}

export function EffectifTab({ siteId }: EffectifTabProps) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('equipe');
  const [mois, setMois] = useState(currentMois);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ouvrier | null>(null);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: ouvriers = [], isLoading } = useQuery({
    queryKey: ['effectif-ouvriers', siteId],
    queryFn: () => effectifApi.listOuvriers(siteId),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => effectifApi.removeOuvrier(siteId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['effectif-ouvriers', siteId] }),
  });

  const q = search.toLowerCase();
  const actifs = ouvriers.filter((o) => o.actif && (
    !q ||
    o.nom.toLowerCase().includes(q) ||
    (o.prenom ?? '').toLowerCase().includes(q) ||
    (o.matricule ?? '').toLowerCase().includes(q) ||
    (o.fonction ?? '').toLowerCase().includes(q)
  ));
  const inactifs = ouvriers.filter((o) => !o.actif);

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'equipe', label: `Équipe (${ouvriers.filter(o => o.actif).length})` },
    { key: 'pointage', label: 'Pointage' },
    { key: 'salaires', label: 'Bulletin de paie' },
    { key: 'recap', label: 'Récap effectif' },
  ];

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && actifs.length === 1) {
      setEditing(actifs[0]);
      setShowForm(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs + contrôles */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 items-end">
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
        <div className="ml-auto flex items-center gap-2 pb-1">
          {/* Recherche matricule/nom */}
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Rechercher matricule, nom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="text-sm border border-slate-200 rounded-lg pl-7 pr-3 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-cyan/40"
            />
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          {/* Sélecteur mois */}
          {(subTab === 'pointage' || subTab === 'salaires' || subTab === 'recap') && (
            <input
              type="month"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cyan/40"
            />
          )}
        </div>
      </div>

      {/* Équipe */}
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
          ) : ouvriers.length === 0 ? (
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
                        <th className="text-left px-3 py-2 font-semibold text-navy">Matricule</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Nom</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Fonction</th>
                        <th className="text-right px-3 py-2 font-semibold text-navy">S.base/mois</th>
                        <th className="text-right px-3 py-2 font-semibold text-navy">Taux/h</th>
                        <th className="text-left px-3 py-2 font-semibold text-navy">Tél.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {actifs.map((o) => {
                        const th = o.salaireBase > 0 ? Math.round(o.salaireBase / 173.33) : 0;
                        return (
                          <tr key={o.id} className="border-b border-slate-100 hover:bg-surface-0">
                            <td className="px-3 py-2 font-mono text-xs text-cyan-dark">{o.matricule ?? '—'}</td>
                            <td className="px-3 py-2 font-medium text-navy">
                              {o.nom} {o.prenom ?? ''}
                              <div className="text-xs font-normal text-slate-400">{QUALIFICATION_LABELS[o.qualification]}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{o.fonction ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-medium text-navy">{o.salaireBase > 0 ? formatFCFA(o.salaireBase) : '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{th > 0 ? formatFCFA(th) : '—'}</td>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {actifs.length === 0 && search && (
                <p className="text-sm text-slate-400 text-center py-4">Aucun résultat pour « {search} »</p>
              )}

              {inactifs.length > 0 && !search && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-slate-500 hover:text-navy py-1">
                    {inactifs.length} inactif{inactifs.length > 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-2">
                    {inactifs.map((o) => (
                      <li key={o.id} className="text-slate-400 flex items-center justify-between py-1 border-b border-slate-100">
                        <span>
                          {o.matricule && <span className="font-mono text-xs text-cyan-dark mr-2">{o.matricule}</span>}
                          {o.nom} {o.prenom ?? ''} — {o.fonction ?? 'Sans fonction'}
                        </span>
                        <button className="text-xs text-cyan-dark hover:underline" onClick={() => { setEditing(o); setShowForm(true); }}>
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

      {/* Pointage */}
      {subTab === 'pointage' && (
        <div className="card">
          <p className="text-xs text-slate-400 mb-3">
            Cliquez sur une case pour saisir les heures (0 = absent, &gt;0 = présent).
            Case verte = jour normal, orange = dimanche/férié, point violet = heures de nuit.
          </p>
          <PointageView siteId={siteId} mois={mois} search={search} />
        </div>
      )}

      {/* Bulletin de paie */}
      {subTab === 'salaires' && (
        <div className="card">
          <ResumeView siteId={siteId} mois={mois} search={search} />
        </div>
      )}

      {/* Récapitulatif d'effectif */}
      {subTab === 'recap' && <RecapEffectifView siteId={siteId} mois={mois} />}

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

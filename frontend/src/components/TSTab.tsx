import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { travauxSuppApi, planningApi, type CreateTsPayload, type UpdateTsPayload } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import {
  TS_STATUS_LABELS,
  type Lot,
  type Role,
  type TravauxSupp,
  type TSStatus,
} from '@/api/types';
import { formatFCFA } from '@/lib/format';
import { montantEnLettres } from '@/lib/nombreEnLettres';

const WRITER_ROLES: Role[] = ['ADMIN', 'DIRECTEUR_PROJET', 'DIRECTEUR_TRAVAUX'];

const STATUS_ORDER: TSStatus[] = ['BROUILLON', 'VALIDE', 'FACTURE', 'PAYE'];

const STATUS_BADGE: Record<TSStatus, string> = {
  BROUILLON: 'bg-slate-100 text-slate-600',
  VALIDE: 'bg-cyan/10 text-cyan-dark',
  FACTURE: 'bg-yellow-100 text-yellow-700',
  PAYE: 'bg-green-light text-green',
};

const STATUS_NEXT_LABEL: Partial<Record<TSStatus, string>> = {
  BROUILLON: 'Valider',
  VALIDE: 'Marquer facturé',
  FACTURE: 'Marquer payé',
};

interface Props {
  siteId: string;
}

export function TSTab({ siteId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user ? WRITER_ROLES.includes(user.role as Role) : false;

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<TravauxSupp | null>(null);

  const tsQuery = useQuery({
    queryKey: ['travaux-supp', siteId],
    queryFn: () => travauxSuppApi.list(siteId),
  });

  const lotsQuery = useQuery({
    queryKey: ['lots', siteId],
    queryFn: () => planningApi.listLots(siteId),
  });

  const list = tsQuery.data ?? [];
  const lots = lotsQuery.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['travaux-supp', siteId] });

  const advanceMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TSStatus }) =>
      travauxSuppApi.update(siteId, id, { status }),
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => travauxSuppApi.remove(siteId, id),
    onSuccess: invalidate,
  });

  // KPIs
  const totalApprouveHt = list
    .filter((t) => t.status !== 'BROUILLON')
    .reduce((s, t) => s + t.montantHt, 0);
  const totalPayeHt = list
    .filter((t) => t.status === 'PAYE')
    .reduce((s, t) => s + t.montantHt, 0);
  const totalTtc = list
    .filter((t) => t.status !== 'BROUILLON')
    .reduce((s, t) => s + t.montantTtc, 0);

  const nextStatus = (current: TSStatus): TSStatus | null => {
    const idx = STATUS_ORDER.indexOf(current);
    return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Nombre de TS" value={String(list.length)} />
        <Kpi label="Total approuvé HT" value={formatFCFA(totalApprouveHt)} highlight />
        <Kpi label="Total TTC approuvé" value={formatFCFA(totalTtc)} />
        <Kpi label="Total payé HT" value={formatFCFA(totalPayeHt)} />
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-navy">
          Travaux supplémentaires ({list.length})
        </h2>
        {canWrite && (
          <button
            onClick={() => { setEditing(null); setShowDialog(true); }}
            className="btn-primary text-sm"
          >
            + Nouveau TS
          </button>
        )}
      </div>

      {/* List */}
      {tsQuery.isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
      ) : list.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-400 text-sm">Aucun travail supplémentaire enregistré.</p>
          {canWrite && (
            <button
              onClick={() => { setEditing(null); setShowDialog(true); }}
              className="mt-3 btn-primary text-sm"
            >
              + Nouveau TS
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((ts) => {
            const next = nextStatus(ts.status);
            return (
              <div key={ts.id} className="card">
                <div className="flex flex-wrap gap-3 justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-navy">{ts.reference}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ts.status]}`}>
                        {TS_STATUS_LABELS[ts.status]}
                      </span>
                      {ts.lotCode && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                          Lot {ts.lotCode}
                        </span>
                      )}
                      {ts.dateNotif && (
                        <span className="text-xs text-slate-400">
                          Notifié le {ts.dateNotif}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{ts.description}</p>
                    {ts.notes && (
                      <p className="text-xs text-slate-400 mt-1">{ts.notes}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-navy">{formatFCFA(ts.montantHt)}</div>
                    <div className="text-xs text-slate-500">
                      TVA {(ts.tvaRate * 100).toFixed(0)} % → TTC {formatFCFA(ts.montantTtc)}
                    </div>
                  </div>
                </div>

                {/* somme en lettres pour TS validés+ */}
                {ts.status !== 'BROUILLON' && (
                  <p className="mt-2 text-xs text-slate-500 italic">
                    Arrêté à la somme de : {montantEnLettres(ts.montantHt)} francs CFA HT
                  </p>
                )}

                {canWrite && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    {next && STATUS_NEXT_LABEL[ts.status] && (
                      <button
                        onClick={() => advanceMut.mutate({ id: ts.id, status: next })}
                        disabled={advanceMut.isPending}
                        className="btn-primary text-xs"
                      >
                        {STATUS_NEXT_LABEL[ts.status]}
                      </button>
                    )}
                    {ts.status === 'BROUILLON' && (
                      <>
                        <button
                          onClick={() => { setEditing(ts); setShowDialog(true); }}
                          className="btn-secondary text-xs"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer le TS "${ts.reference}" ?`)) {
                              removeMut.mutate(ts.id);
                            }
                          }}
                          className="text-xs text-red hover:underline"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary table for validated TS */}
      {list.filter((t) => t.status !== 'BROUILLON').length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-navy mb-3">Récapitulatif des TS approuvés</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="pb-2 text-slate-500">Référence</th>
                <th className="pb-2 text-slate-500">Description</th>
                <th className="pb-2 text-slate-500 text-right">Montant HT</th>
                <th className="pb-2 text-slate-500 text-right">TTC</th>
                <th className="pb-2 text-slate-500">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list
                .filter((t) => t.status !== 'BROUILLON')
                .map((ts) => (
                  <tr key={ts.id}>
                    <td className="py-2 font-medium text-navy">{ts.reference}</td>
                    <td className="py-2 text-slate-600 truncate max-w-xs">{ts.description}</td>
                    <td className="py-2 text-right">{formatFCFA(ts.montantHt)}</td>
                    <td className="py-2 text-right">{formatFCFA(ts.montantTtc)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ts.status]}`}>
                        {TS_STATUS_LABELS[ts.status]}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="pt-2" colSpan={2}>Total</td>
                <td className="pt-2 text-right text-navy">{formatFCFA(totalApprouveHt)}</td>
                <td className="pt-2 text-right text-navy">{formatFCFA(totalTtc)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showDialog && (
        <TSDialog
          siteId={siteId}
          lots={lots}
          ts={editing}
          onClose={() => { setShowDialog(false); setEditing(null); }}
          onSaved={() => { invalidate(); setShowDialog(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-navy text-white' : 'bg-slate-50'}`}>
      <p className={`text-xs ${highlight ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-base font-bold mt-0.5 ${highlight ? 'text-white' : 'text-navy'}`}>{value}</p>
    </div>
  );
}

interface TSDialogProps {
  siteId: string;
  lots: Lot[];
  ts: TravauxSupp | null;
  onClose: () => void;
  onSaved: () => void;
}

function TSDialog({ siteId, lots, ts, onClose, onSaved }: TSDialogProps) {
  const [reference, setReference] = useState(ts?.reference ?? '');
  const [description, setDescription] = useState(ts?.description ?? '');
  const [montantHt, setMontantHt] = useState(ts ? String(ts.montantHt) : '');
  const [tvaRate, setTvaRate] = useState(ts ? String(ts.tvaRate * 100) : '18');
  const [lotId, setLotId] = useState(ts?.lotId ?? '');
  const [dateNotif, setDateNotif] = useState(ts?.dateNotif ?? '');
  const [notes, setNotes] = useState(ts?.notes ?? '');
  const [error, setError] = useState('');

  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (payload: CreateTsPayload) => travauxSuppApi.create(siteId, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travaux-supp', siteId] }); onSaved(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Erreur'));
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: UpdateTsPayload) => travauxSuppApi.update(siteId, ts!.id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['travaux-supp', siteId] }); onSaved(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Erreur'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ht = parseFloat(montantHt);
    const tva = parseFloat(tvaRate) / 100;
    if (!reference.trim()) { setError('Référence requise'); return; }
    if (!description.trim()) { setError('Description requise'); return; }
    if (isNaN(ht) || ht < 0) { setError('Montant HT invalide'); return; }

    const payload = {
      reference: reference.trim(),
      description: description.trim(),
      montantHt: ht,
      tvaRate: tva,
      lotId: lotId || undefined,
      dateNotif: dateNotif || undefined,
      notes: notes.trim() || undefined,
    };

    setError('');
    if (ts) {
      updateMut.mutate({ ...payload, lotId: lotId || null });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-navy text-lg">
            {ts ? 'Modifier le TS' : 'Nouveau travail supplémentaire'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Référence *</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="TS-001"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lot (optionnel)</label>
              <select
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                className="input w-full"
              >
                <option value="">— Aucun —</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} – {l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description des travaux supplémentaires…"
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Montant HT (FCFA) *</label>
              <input
                type="number"
                min="0"
                value={montantHt}
                onChange={(e) => setMontantHt(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">TVA (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={tvaRate}
                onChange={(e) => setTvaRate(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date de notification</label>
            <input
              type="date"
              value={dateNotif}
              onChange={(e) => setDateNotif(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, références d'ordre de service…"
              className="input w-full"
            />
          </div>

          {error && <p className="text-sm text-red">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Annuler</button>
            <button type="submit" disabled={isPending} className="btn-primary text-sm">
              {isPending ? 'Enregistrement…' : ts ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

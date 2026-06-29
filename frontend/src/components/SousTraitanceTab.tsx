import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sousTraitanceApi,
  planningApi,
  type CreateContratSTPayload,
  type CreateSituationSTPayload,
} from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import {
  CONTRAT_ST_STATUS_LABELS,
  SITUATION_ST_STATUS_LABELS,
  type ContratST,
  type ContratSTStatus,
  type Role,
  type SituationST,
  type SituationSTStatus,
  type SousTraitant,
} from '@/api/types';
import { formatFCFA } from '@/lib/format';
import { montantEnLettres } from '@/lib/nombreEnLettres';

const ROLE_LEVEL: Record<Role, number> = {
  ADMIN: 4,
  DIRECTEUR_PROJET: 3,
  DIRECTEUR_TRAVAUX: 2,
  CONDUCTEUR_TRAVAUX: 1,
};

const STATUS_BADGE: Record<ContratSTStatus, string> = {
  ACTIF: 'bg-green-light text-green',
  TERMINE: 'bg-slate-100 text-slate-500',
  RESILIE: 'bg-red/10 text-red',
};

const SIT_BADGE: Record<SituationSTStatus, string> = {
  BROUILLON: 'bg-slate-100 text-slate-600',
  VALIDEE: 'bg-green-light text-green',
  PAYEE: 'bg-cyan/10 text-cyan-dark',
};

const SIT_NEXT: Record<SituationSTStatus, { label: string; value: SituationSTStatus } | null> = {
  BROUILLON: { label: 'Valider', value: 'VALIDEE' },
  VALIDEE: { label: 'Marquer payée', value: 'PAYEE' },
  PAYEE: null,
};

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}
function thisDay() {
  return new Date().toISOString().slice(0, 10);
}

/* ── Composant principal ─────────────────────────────────────────────── */
export function SousTraitanceTab({ siteId }: { siteId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = (user && ROLE_LEVEL[user.role] >= ROLE_LEVEL.DIRECTEUR_TRAVAUX) ?? false;

  const [showAddST, setShowAddST] = useState(false);
  const [openSTId, setOpenSTId] = useState<string | null>(null);

  const { data: sousTraitants, isLoading } = useQuery({
    queryKey: ['sous-traitance', siteId],
    queryFn: () => sousTraitanceApi.list(siteId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['sous-traitance', siteId] });

  const totalContrats = sousTraitants?.reduce((a, st) => a + st.contrats.length, 0) ?? 0;
  const totalEngage = sousTraitants?.reduce(
    (a, st) => a + st.contrats.reduce((b, c) => b + c.montantHt, 0),
    0,
  ) ?? 0;
  const totalCumul = sousTraitants?.reduce(
    (a, st) => a + st.contrats.reduce((b, c) => b + c.montantHtCumul, 0),
    0,
  ) ?? 0;
  const totalPaye = sousTraitants?.reduce(
    (a, st) => a + st.contrats.reduce((b, c) => b + c.totalPaye, 0),
    0,
  ) ?? 0;
  const totalARecouvrer = sousTraitants?.reduce(
    (a, st) => a + st.contrats.reduce((b, c) => b + c.totalARecouvrer, 0),
    0,
  ) ?? 0;

  if (isLoading)
    return <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-navy">Sous-traitance</h2>
        {canWrite && (
          <button className="btn-secondary text-sm" onClick={() => setShowAddST((v) => !v)}>
            {showAddST ? 'Annuler' : '+ Nouveau sous-traitant'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Contrats', val: String(totalContrats), color: 'text-navy' },
          { label: 'Engagé HT', val: formatFCFA(totalEngage), color: 'text-navy' },
          { label: 'Facturé HT', val: formatFCFA(totalCumul), color: 'text-navy' },
          { label: 'Payé', val: formatFCFA(totalPaye), color: 'text-green' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card py-3">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className={`text-sm font-semibold ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {totalARecouvrer > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {formatFCFA(totalARecouvrer)} en attente de paiement (situations validées)
        </div>
      )}

      {/* Formulaire ajout ST */}
      {showAddST && (
        <AddSousTraitantForm
          siteId={siteId}
          onSuccess={() => { setShowAddST(false); refresh(); }}
        />
      )}

      {/* Liste sous-traitants */}
      {(sousTraitants?.length ?? 0) === 0 ? (
        <div className="card py-12 text-center text-slate-500">
          Aucun sous-traitant enregistré.
          {canWrite && ' Ajoutez le premier pour démarrer le suivi.'}
        </div>
      ) : (
        <div className="space-y-3">
          {sousTraitants?.map((st) => (
            <SousTraitantCard
              key={st.id}
              siteId={siteId}
              st={st}
              open={openSTId === st.id}
              onToggle={() => setOpenSTId((v) => (v === st.id ? null : st.id))}
              canWrite={canWrite}
              onChange={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Formulaire ajout sous-traitant ────────────────────────────────── */
function AddSousTraitantForm({
  siteId, onSuccess,
}: { siteId: string; onSuccess: () => void }) {
  const [nom, setNom] = useState('');
  const [contact, setContact] = useState('');

  const create = useMutation({
    mutationFn: () => sousTraitanceApi.createST(siteId, { nom, contact: contact || undefined }),
    onSuccess,
  });

  return (
    <form
      className="card flex flex-wrap items-end gap-3"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs text-slate-500 mb-1">Nom du sous-traitant</label>
        <input className="input w-full" placeholder="Ex : KIDJA PLOMBERIE" value={nom}
          onChange={(e) => setNom(e.target.value)} required />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs text-slate-500 mb-1">Contact (optionnel)</label>
        <input className="input w-full" placeholder="Email ou téléphone" value={contact}
          onChange={(e) => setContact(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary" disabled={create.isPending}>
        {create.isPending ? 'Ajout…' : 'Ajouter'}
      </button>
    </form>
  );
}

/* ── Carte Sous-traitant ──────────────────────────────────────────── */
function SousTraitantCard({
  siteId, st, open, onToggle, canWrite, onChange,
}: {
  siteId: string; st: SousTraitant; open: boolean;
  onToggle: () => void; canWrite: boolean; onChange: () => void;
}) {
  const [showAddContrat, setShowAddContrat] = useState(false);

  const totalST = st.contrats.reduce((a, c) => a + c.montantHt, 0);
  const totalPayeST = st.contrats.reduce((a, c) => a + c.totalPaye, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-lg leading-none text-navy hover:bg-surface-1"
          >
            {open ? '−' : '+'}
          </button>
          <div>
            <div className="font-medium text-navy">{st.nom}</div>
            {st.contact && <div className="text-xs text-slate-500">{st.contact}</div>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{st.contrats.length} contrat{st.contrats.length > 1 ? 's' : ''}</span>
          <span className="font-medium text-navy">{formatFCFA(totalST)}</span>
          {totalPayeST > 0 && (
            <span className="text-xs text-green">{formatFCFA(totalPayeST)} payé</span>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {canWrite && (
            <button
              className="btn-secondary text-xs"
              onClick={() => setShowAddContrat((v) => !v)}
            >
              {showAddContrat ? 'Annuler' : '+ Nouveau contrat'}
            </button>
          )}

          {showAddContrat && (
            <AddContratForm
              siteId={siteId}
              sousTraitantId={st.id}
              onSuccess={() => { setShowAddContrat(false); onChange(); }}
            />
          )}

          {st.contrats.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Aucun contrat</p>
          ) : (
            st.contrats.map((c) => (
              <ContratCard
                key={c.id}
                siteId={siteId}
                contrat={c}
                canWrite={canWrite}
                onChange={onChange}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Formulaire nouveau contrat ──────────────────────────────────── */
function AddContratForm({
  siteId, sousTraitantId, onSuccess,
}: { siteId: string; sousTraitantId: string; onSuccess: () => void }) {
  const [reference, setReference] = useState('');
  const [intitule, setIntitule] = useState('');
  const [montantHt, setMontantHt] = useState('');
  const [lotId, setLotId] = useState('');

  const { data: lots } = useQuery({
    queryKey: ['planning', siteId],
    queryFn: () => planningApi.listLots(siteId),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateContratSTPayload = {
        sousTraitantId,
        reference,
        intitule,
        montantHt: Number(montantHt),
        lotId: lotId || undefined,
      };
      return sousTraitanceApi.createContrat(siteId, payload);
    },
    onSuccess,
  });

  return (
    <form
      className="rounded-lg border border-dashed border-slate-300 bg-surface-1 p-4 space-y-3"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Référence</label>
          <input className="input w-full text-sm" placeholder="Ex : OF226-25" value={reference}
            onChange={(e) => setReference(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Lot concerné</label>
          <select className="input w-full text-sm" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">— Aucun lot —</option>
            {lots?.map((l) => (
              <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Intitulé des travaux</label>
          <input className="input w-full text-sm" placeholder="Ex : Fourniture et pose plomberie"
            value={intitule} onChange={(e) => setIntitule(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Montant HT (FCFA)</label>
          <input type="number" min={0} step={1} className="input w-full text-sm text-right"
            placeholder="0" value={montantHt} onChange={(e) => setMontantHt(e.target.value)} required />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="submit" className="btn-primary text-sm" disabled={create.isPending}>
          {create.isPending ? 'Création…' : 'Créer le contrat'}
        </button>
      </div>
    </form>
  );
}

/* ── Carte Contrat ST ────────────────────────────────────────────── */
function ContratCard({
  siteId, contrat: c, canWrite, onChange,
}: {
  siteId: string; contrat: ContratST; canWrite: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAddSit, setShowAddSit] = useState(false);

  const pct = Math.min(100, c.pctAvancement);

  return (
    <div className="rounded-lg border border-slate-200 bg-surface-1">
      {/* En-tête contrat */}
      <div
        className="flex flex-wrap items-center gap-3 p-4 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-cyan-dark bg-cyan/10 rounded px-1.5 py-0.5">
              {c.reference}
            </span>
            {c.lotCode && (
              <span className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                {c.lotCode}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status]}`}>
              {CONTRAT_ST_STATUS_LABELS[c.status]}
            </span>
          </div>
          <div className="text-sm font-medium text-navy mt-1 truncate">{c.intitule}</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-dark rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-500 shrink-0">
              {pct.toFixed(1)} %
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-navy">{formatFCFA(c.montantHt)}</div>
          <div className="text-xs text-slate-500">Marché HT</div>
          {c.totalPaye > 0 && (
            <div className="text-xs text-green mt-0.5">{formatFCFA(c.totalPaye)} payé</div>
          )}
          {c.totalARecouvrer > 0 && (
            <div className="text-xs text-amber-600 mt-0.5">{formatFCFA(c.totalARecouvrer)} à payer</div>
          )}
        </div>
        <span className="text-slate-400 text-lg">{open ? '▲' : '▼'}</span>
      </div>

      {/* Détail contrat */}
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          {/* Paramètres */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span>TVA : {(c.tvaRate * 100).toFixed(0)} %</span>
            <span>RG : {(c.tauxRg * 100).toFixed(0)} %</span>
            {c.avanceForfaitaire > 0 && (
              <span>Avance : {formatFCFA(c.avanceForfaitaire)}</span>
            )}
            {c.avanceForfaitaire > 0 && (
              <span className={c.avanceRestante < 0 ? 'text-red' : 'text-green'}>
                Solde avance : {formatFCFA(c.avanceRestante)}
              </span>
            )}
          </div>

          {/* Bouton + situation */}
          {canWrite && (
            <button
              className="btn-secondary text-xs"
              onClick={() => setShowAddSit((v) => !v)}
            >
              {showAddSit ? 'Annuler' : '+ Nouvelle situation'}
            </button>
          )}
          {showAddSit && (
            <AddSituationSTForm
              siteId={siteId}
              contratId={c.id}
              nextNumero={(c.situations.length) + 1}
              onSuccess={() => { setShowAddSit(false); onChange(); }}
            />
          )}

          {/* Situations */}
          {c.situations.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">Aucune situation</p>
          ) : (
            <div className="space-y-2">
              {c.situations.map((sit) => (
                <SituationSTCard
                  key={sit.id}
                  siteId={siteId}
                  contratId={c.id}
                  situation={sit}
                  canWrite={canWrite}
                  onChange={onChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Formulaire nouvelle situation ST ───────────────────────────── */
function AddSituationSTForm({
  siteId, contratId, nextNumero, onSuccess,
}: {
  siteId: string; contratId: string; nextNumero: number; onSuccess: () => void;
}) {
  const [numero, setNumero] = useState(nextNumero);
  const [periode, setPeriode] = useState(thisMonth());
  const [dateEmission, setDateEmission] = useState(thisDay());
  const [montantHt, setMontantHt] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateSituationSTPayload = {
        numero,
        periode,
        dateEmission,
        montantHtPeriode: montantHt ? Number(montantHt) : 0,
      };
      return sousTraitanceApi.createSituationST(siteId, contratId, payload);
    },
    onSuccess,
  });

  return (
    <form
      className="rounded bg-surface-2 border border-dashed border-slate-200 p-3 flex flex-wrap gap-3 items-end"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <div>
        <label className="block text-xs text-slate-500 mb-1">N° sit.</label>
        <input type="number" min={1} className="input w-16 text-sm" value={numero}
          onChange={(e) => setNumero(Number(e.target.value))} required />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Période</label>
        <input type="month" className="input w-32 text-sm" value={periode}
          onChange={(e) => setPeriode(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Date émission</label>
        <input type="date" className="input w-36 text-sm" value={dateEmission}
          onChange={(e) => setDateEmission(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Montant HT (FCFA)</label>
        <input type="number" min={0} step={1} className="input w-36 text-sm text-right"
          placeholder="0" value={montantHt} onChange={(e) => setMontantHt(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary text-sm" disabled={create.isPending}>
        {create.isPending ? '…' : 'Créer'}
      </button>
    </form>
  );
}

/* ── Carte Situation ST ─────────────────────────────────────────── */
function SituationSTCard({
  siteId, contratId, situation: sit, canWrite, onChange,
}: {
  siteId: string; contratId: string; situation: SituationST;
  canWrite: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [montantEdit, setMontantEdit] = useState(String(sit.montantHtPeriode));
  const [dedEdit, setDedEdit] = useState(String(sit.deductionAvance));
  const locked = sit.status !== 'BROUILLON';
  const next = SIT_NEXT[sit.status];

  const update = useMutation({
    mutationFn: (payload: Parameters<typeof sousTraitanceApi.updateSituationST>[3]) =>
      sousTraitanceApi.updateSituationST(siteId, contratId, sit.id, payload),
    onSuccess: onChange,
  });

  const remove = useMutation({
    mutationFn: () => sousTraitanceApi.deleteSituationST(siteId, contratId, sit.id),
    onSuccess: onChange,
  });

  return (
    <div className="rounded border border-slate-200 bg-white">
      {/* En-tête situation */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 text-sm text-navy"
          >
            {open ? '−' : '+'}
          </button>
          <span className="text-sm font-medium text-navy">Sit. n° {sit.numero}</span>
          <span className="text-xs text-slate-400">· {sit.periode}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-navy">{formatFCFA(sit.netAPayer)}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SIT_BADGE[sit.status]}`}>
            {SITUATION_ST_STATUS_LABELS[sit.status]}
          </span>
          {canWrite && next && (
            <button
              className="btn-secondary text-xs"
              onClick={() => update.mutate({ status: next.value })}
              disabled={update.isPending}
            >
              {next.label}
            </button>
          )}
          {canWrite && sit.status === 'BROUILLON' && (
            <button
              className="text-xs text-red hover:underline"
              onClick={() => remove.mutate()}
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Détail situation */}
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-4">
          {/* Montant période */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 w-36 shrink-0">Montant HT période :</label>
            {locked ? (
              <span className="text-sm font-medium text-navy">{formatFCFA(sit.montantHtPeriode)}</span>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} step={1}
                  className="input w-36 text-right text-sm"
                  value={montantEdit}
                  onChange={(e) => setMontantEdit(e.target.value)}
                  onBlur={() => {
                    const v = Number(montantEdit);
                    if (v !== sit.montantHtPeriode) update.mutate({ montantHtPeriode: v });
                  }}
                />
                <span className="text-xs text-slate-400">FCFA</span>
              </div>
            )}
          </div>

          {/* Déduction avance */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 w-36 shrink-0">Déduction avance :</label>
            {locked ? (
              <span className="text-sm font-medium text-orange">
                {sit.deductionAvance > 0 ? `− ${formatFCFA(sit.deductionAvance)}` : '—'}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-orange text-sm">−</span>
                <input
                  type="number" min={0} step={1000}
                  className="input w-36 text-right text-sm"
                  value={dedEdit}
                  onChange={(e) => setDedEdit(e.target.value)}
                  onBlur={() => {
                    const v = Number(dedEdit);
                    if (v !== sit.deductionAvance) update.mutate({ deductionAvance: v });
                  }}
                />
                <span className="text-xs text-slate-400">FCFA</span>
              </div>
            )}
          </div>

          {/* Récapitulatif financier */}
          <div className="ml-auto max-w-xs w-full space-y-1 text-sm border-t border-slate-100 pt-3">
            <RecapRow label="Montant HT période" value={formatFCFA(sit.montantHtPeriode)} />
            <RecapRow label={`Retenue de garantie`} value={`− ${formatFCFA(sit.rgHt)}`} red />
            {sit.deductionAvance > 0 && (
              <RecapRow label="Déduction avance" value={`− ${formatFCFA(sit.deductionAvance)}`} orange />
            )}
            <div className="border-t border-slate-200 pt-1 mt-1" />
            <RecapRow label="Total HTVA" value={formatFCFA(sit.totalHtva)} bold />
            <RecapRow label={`TVA`} value={formatFCFA(sit.tvaAmount)} />
            <div className="border-t-2 border-navy pt-2 mt-1 flex justify-between font-bold text-navy text-base">
              <span>NET À PAYER</span>
              <span>{formatFCFA(sit.netAPayer)}</span>
            </div>
            <div className="mt-2 rounded border border-navy/20 bg-surface-1 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
                Arrêtée à la somme de :
              </p>
              <p className="text-xs font-bold text-navy uppercase leading-snug">
                {montantEnLettres(sit.netAPayer).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecapRow({
  label, value, bold, red, orange,
}: {
  label: string; value: string; bold?: boolean; red?: boolean; orange?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-navy' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className={red ? 'text-red font-medium' : orange ? 'text-orange font-medium' : bold ? 'text-navy' : ''}>
        {value}
      </span>
    </div>
  );
}

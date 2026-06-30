import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avenantsApi, financeApi, planningApi, sitesApi, type CreateAvenantPayload, type CreateSituationPayload } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import {
  SITUATION_STATUS_LABELS,
  type Avenant,
  type Role,
  type Site,
  type Situation,
  type SituationStatus,
} from '@/api/types';
import { formatFCFA } from '@/lib/format';
import { montantEnLettres } from '@/lib/nombreEnLettres';

const ROLE_LEVEL: Record<Role, number> = {
  ADMIN: 4,
  DIRECTEUR_PROJET: 3,
  DIRECTEUR_TRAVAUX: 2,
  CONDUCTEUR_TRAVAUX: 1,
};

const STATUS_BADGE: Record<SituationStatus, string> = {
  BROUILLON: 'bg-slate-100 text-slate-600',
  VALIDEE: 'bg-green-light text-green',
  PAYEE: 'bg-cyan/10 text-cyan-dark',
};

const STATUS_NEXT: Record<
  SituationStatus,
  { label: string; value: SituationStatus } | null
> = {
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

/* ── Champ numérique éditable ─────────────────────────────────────────── */
function EditableNum({
  label,
  value,
  format,
  onSave,
  canEdit,
  unit = '',
  step = 1,
  max,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onSave: (v: number) => void;
  canEdit: boolean;
  unit?: string;
  step?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));

  if (!editing)
    return (
      <div className="text-right">
        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
        <div
          className={`text-sm font-medium text-navy ${canEdit ? 'cursor-pointer hover:text-cyan-dark' : ''}`}
          onClick={() => canEdit && setEditing(true)}
          title={canEdit ? 'Cliquer pour modifier' : undefined}
        >
          {format(value)}
          {unit && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
        </div>
      </div>
    );

  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Number(val));
        setEditing(false);
      }}
    >
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={max}
          step={step}
          className="input w-28 text-right text-xs py-0.5"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
        />
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
        <button type="submit" className="btn-primary text-xs px-2 py-1">OK</button>
        <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => setEditing(false)}>✕</button>
      </div>
    </form>
  );
}

/* ── Composant principal ─────────────────────────────────────────────── */
export function FinanceTab({
  siteId,
  siteName,
  siteReference,
}: {
  siteId: string;
  siteName: string;
  siteReference: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = (user && ROLE_LEVEL[user.role] >= ROLE_LEVEL.DIRECTEUR_TRAVAUX) ?? false;

  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const siteQuery = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => sitesApi.get(siteId),
  });
  const { data: situations, isLoading } = useQuery({
    queryKey: ['finance', siteId],
    queryFn: () => financeApi.listSituations(siteId),
  });
  const { data: lots } = useQuery({
    queryKey: ['planning', siteId],
    queryFn: () => planningApi.listLots(siteId),
  });
  const { data: avenants = [] } = useQuery({
    queryKey: ['avenants', siteId],
    queryFn: () => avenantsApi.list(siteId),
  });

  const refreshAvenants = () =>
    queryClient.invalidateQueries({ queryKey: ['avenants', siteId] });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['planning', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
  };

  const updateSite = useMutation({
    mutationFn: (payload: Partial<Pick<Site, 'tauxRg' | 'avanceForfaitaire'>>) =>
      sitesApi.update(siteId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    },
  });

  const site = siteQuery.data;

  if (isLoading || !site)
    return <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>;

  const totalBudgetLots = lots?.reduce((a, l) => a + l.montantMarcheHt, 0) ?? 0;
  const totalDeductionAvances =
    situations
      ?.filter((s) => s.status !== 'BROUILLON')
      .reduce((a, s) => a + s.deductionAvance, 0) ?? 0;
  const avanceRestante = site.avanceForfaitaire - totalDeductionAvances;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-navy">Situations de travaux</h2>
        {canWrite && (
          <button className="btn-secondary text-sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Annuler' : '+ Nouvelle situation'}
          </button>
        )}
      </div>

      {/* Paramètres financiers du chantier */}
      <div className="card">
        <h3 className="font-medium text-navy text-sm mb-3">Paramètres financiers</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <EditableNum
            label="Taux RG"
            value={Math.round(site.tauxRg * 100)}
            format={(v) => `${v} %`}
            unit=""
            step={1}
            max={100}
            canEdit={canWrite}
            onSave={(v) => updateSite.mutate({ tauxRg: v / 100 })}
          />
          <EditableNum
            label="Avance forfaitaire"
            value={site.avanceForfaitaire}
            format={formatFCFA}
            step={1000}
            canEdit={canWrite}
            onSave={(v) => updateSite.mutate({ avanceForfaitaire: v })}
          />
          <div className="text-right">
            <div className="text-xs text-slate-500 mb-0.5">Avances récupérées</div>
            <div className="text-sm font-medium text-navy">{formatFCFA(totalDeductionAvances)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 mb-0.5">Solde avance</div>
            <div className={`text-sm font-medium ${avanceRestante < 0 ? 'text-red' : 'text-green'}`}>
              {formatFCFA(avanceRestante)}
            </div>
          </div>
        </div>
      </div>

      {/* Budget par lot */}
      {lots && lots.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-navy text-sm">Marchés par lot</h3>
            {totalBudgetLots > 0 && (
              <span className="text-xs text-slate-500">
                Total : {formatFCFA(totalBudgetLots)}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {lots.map((lot) => (
              <LotBudgetRow
                key={lot.id}
                siteId={siteId}
                lotId={lot.id}
                code={lot.code}
                name={lot.name}
                montantMarcheHt={lot.montantMarcheHt}
                canWrite={canWrite}
                onChange={refresh}
              />
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateSituationForm
          siteId={siteId}
          nextNumero={(situations?.length ?? 0) + 1}
          onSuccess={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {(situations?.length ?? 0) === 0 ? (
        <div className="card py-12 text-center text-slate-500">
          Aucune situation de travaux.
          {canWrite && ' Créez la première pour démarrer le suivi financier.'}
        </div>
      ) : (
        <div className="space-y-3">
          {[...(situations ?? [])].sort((a, b) => a.numero - b.numero).map((s, idx, arr) => (
            <SituationCard
              key={s.id}
              siteId={siteId}
              siteName={siteName}
              siteReference={siteReference}
              siteMarcheHt={site.marcheHt}
              siteAvanceForfaitaire={site.avanceForfaitaire}
              siteTvaRate={site.tvaRate}
              siteTauxRg={site.tauxRg}
              prevTotalHt={idx > 0 ? arr[idx - 1].totalHt : 0}
              situation={s}
              open={openId === s.id}
              onToggle={() => setOpenId((v) => (v === s.id ? null : s.id))}
              canWrite={canWrite}
              onChange={refresh}
            />
          ))}
        </div>
      )}

      {/* ── Avenants ─────────────────────────────────────────────────── */}
      <AvenantsSection
        siteId={siteId}
        marcheHt={site.marcheHt}
        avenants={avenants}
        canWrite={canWrite}
        onChange={refreshAvenants}
      />
    </div>
  );
}

/* ── Budget par lot ────────────────────────────────────────────────────── */
function LotBudgetRow({
  siteId, lotId, code, name, montantMarcheHt, canWrite, onChange,
}: {
  siteId: string; lotId: string; code: string; name: string;
  montantMarcheHt: number; canWrite: boolean; onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(montantMarcheHt));

  const save = useMutation({
    mutationFn: () => financeApi.updateLotBudget(siteId, lotId, Number(val)),
    onSuccess: () => { setEditing(false); onChange(); },
  });

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-cyan-dark font-medium w-16 shrink-0">{code}</span>
      <span className="flex-1 text-navy truncate">{name}</span>
      {editing ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <input type="number" min={0} step={1} className="input w-36 text-right text-xs"
            value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <button type="submit" className="btn-primary text-xs px-2 py-1">OK</button>
          <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => setEditing(false)}>✕</button>
        </form>
      ) : (
        <span
          className={`font-medium ${montantMarcheHt > 0 ? 'text-navy' : 'text-slate-400'} ${canWrite ? 'cursor-pointer hover:text-cyan-dark' : ''}`}
          onClick={() => canWrite && setEditing(true)}
          title={canWrite ? 'Cliquer pour modifier' : undefined}
        >
          {montantMarcheHt > 0 ? formatFCFA(montantMarcheHt) : canWrite ? '— saisir le marché' : '—'}
        </span>
      )}
    </div>
  );
}

/* ── Formulaire création ──────────────────────────────────────────────── */
function CreateSituationForm({ siteId, nextNumero, onSuccess }: {
  siteId: string; nextNumero: number; onSuccess: () => void;
}) {
  const [numero, setNumero] = useState(nextNumero);
  const [periode, setPeriode] = useState(thisMonth());
  const [dateEmission, setDateEmission] = useState(thisDay());
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateSituationPayload = { numero, periode, dateEmission, notes: notes || undefined };
      return financeApi.createSituation(siteId, payload);
    },
    onSuccess,
  });

  return (
    <form className="card flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <div>
        <label className="block text-xs text-slate-500 mb-1">N° situation</label>
        <input type="number" min={1} className="input w-20" value={numero}
          onChange={(e) => setNumero(Number(e.target.value))} required />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Période</label>
        <input type="month" className="input w-36" value={periode} onChange={(e) => setPeriode(e.target.value)} required />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Date d'émission</label>
        <input type="date" className="input w-36" value={dateEmission} onChange={(e) => setDateEmission(e.target.value)} required />
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <input className="input" placeholder="Optionnel" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary" disabled={create.isPending}>
        {create.isPending ? 'Création…' : 'Créer'}
      </button>
    </form>
  );
}

/* ── Carte Situation ───────────────────────────────────────────────────── */
function SituationCard({
  siteId, siteName, siteReference,
  siteMarcheHt, siteAvanceForfaitaire, siteTvaRate, siteTauxRg,
  prevTotalHt,
  situation: s, open, onToggle, canWrite, onChange,
}: {
  siteId: string; siteName: string; siteReference: string;
  siteMarcheHt: number; siteAvanceForfaitaire: number;
  siteTvaRate: number; siteTauxRg: number;
  prevTotalHt: number;
  situation: Situation; open: boolean; onToggle: () => void;
  canWrite: boolean; onChange: () => void;
}) {
  const [showFacture, setShowFacture] = useState(false);
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: (status: SituationStatus) =>
      financeApi.updateSituation(siteId, s.id, { status }),
    onSuccess: () => {
      onChange();
      void queryClient.invalidateQueries({ queryKey: ['finance', siteId] });
    },
  });

  const updateDed = useMutation({
    mutationFn: (deductionAvance: number) =>
      financeApi.updateSituation(siteId, s.id, { deductionAvance }),
    onSuccess: onChange,
  });

  const remove = useMutation({
    mutationFn: () => financeApi.deleteSituation(siteId, s.id),
    onSuccess: onChange,
  });

  const next = STATUS_NEXT[s.status];
  const locked = s.status !== 'BROUILLON' || !canWrite;

  return (
    <div className="card">
      {/* En-tête de la carte */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-lg leading-none text-navy hover:bg-surface-1"
            aria-label={open ? 'Réduire' : 'Développer'}>
            {open ? '−' : '+'}
          </button>
          <div className="min-w-0">
            <div className="font-medium text-navy">
              Situation n° {s.numero}
              <span className="text-slate-400 font-normal"> · {s.periode}</span>
            </div>
            <div className="text-xs text-slate-500">Émise le {s.dateEmission.toString().slice(0, 10)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-navy">{formatFCFA(s.netAPayer)}<span className="text-xs font-normal text-slate-400 ml-1">net</span></div>
            <div className="text-xs text-slate-500">{formatFCFA(s.totalTtc)} TTC brut</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s.status]}`}>
            {SITUATION_STATUS_LABELS[s.status]}
          </span>
          {canWrite && next && (
            <button className="btn-secondary text-xs" onClick={() => updateStatus.mutate(next.value)} disabled={updateStatus.isPending}>
              {next.label}
            </button>
          )}
          {canWrite && s.status === 'BROUILLON' && (
            <button className="text-xs text-red hover:underline" onClick={() => remove.mutate()}>Supprimer</button>
          )}
          <button
            className="btn-secondary text-xs"
            onClick={async () => {
              const m = await import('@/lib/exportFinance');
              m.exportSituationToPdf({ name: siteName, reference: siteReference }, s);
            }}
          >
            PDF Situation
          </button>
          {(s.status === 'VALIDEE' || s.status === 'PAYEE') && (
            <button
              className="btn-secondary text-xs"
              onClick={() => setShowFacture(true)}
            >
              Facture PDF
            </button>
          )}
        </div>
      </div>

      {showFacture && (
        <FactureDialog
          situation={s}
          siteName={siteName}
          siteReference={siteReference}
          siteMarcheHt={siteMarcheHt}
          siteAvanceForfaitaire={siteAvanceForfaitaire}
          siteTvaRate={siteTvaRate}
          siteTauxRg={siteTauxRg}
          prevTotalHt={prevTotalHt}
          onClose={() => setShowFacture(false)}
        />
      )}

      {open && (
        <div className="mt-4 space-y-4">
          {/* Tableau décompte */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-3">Lot</th>
                  <th className="text-right pb-2 pr-3 w-32">Marché HT</th>
                  <th className="text-right pb-2 pr-3 w-24">Avanct. %</th>
                  <th className="text-right pb-2 w-36">Montant HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.lignes.map((l) => (
                  <LigneRow
                    key={l.id}
                    siteId={siteId}
                    situationId={s.id}
                    ligne={l}
                    locked={locked}
                    onChange={onChange}
                  />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 text-sm">
                <tr className="font-semibold text-navy">
                  <td className="pt-2 pr-3">TOTAL</td>
                  <td className="text-right pt-2 pr-3">{formatFCFA(s.lignes.reduce((a, l) => a + l.montantMarcheHt, 0))}</td>
                  <td />
                  <td className="text-right pt-2">{formatFCFA(s.totalHt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Récapitulatif financier */}
          <div className="border-t border-slate-200 pt-3 ml-auto max-w-xs w-full space-y-1 text-sm">
            <Row label={`Montant HT cumulé`} value={formatFCFA(s.totalHt)} />
            <Row label={`TVA (${(s.tvaRate * 100).toFixed(0)} %)`} value={formatFCFA(s.totalTva)} />
            <Row label="Total TTC brut" value={formatFCFA(s.totalTtc)} bold />
            <div className="border-t border-slate-200 pt-1 mt-1" />
            <Row
              label={`Retenue de garantie (${(s.tauxRg * 100).toFixed(0)} %)`}
              value={`− ${formatFCFA(s.montantRg)}`}
              red
            />
            {/* Déduction avance — éditable sur brouillon */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Déduction d'avance</span>
              {locked ? (
                <span className="font-medium text-orange">− {formatFCFA(s.deductionAvance)}</span>
              ) : (
                <DeductionInput
                  value={s.deductionAvance}
                  onSave={(v) => updateDed.mutate(v)}
                />
              )}
            </div>
            <div className="border-t-2 border-navy pt-2 mt-1 flex justify-between font-bold text-navy text-base">
              <span>NET À PAYER</span>
              <span>{formatFCFA(s.netAPayer)}</span>
            </div>
            <div className="mt-2 rounded border border-navy/20 bg-surface-1 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Arrêtée à la somme de :</p>
              <p className="text-xs font-bold text-navy uppercase leading-snug">
                {montantEnLettres(s.netAPayer).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, red }: { label: string; value: string; bold?: boolean; red?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-navy' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className={red ? 'text-red font-medium' : bold ? 'text-navy' : ''}>{value}</span>
    </div>
  );
}

function DeductionInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex items-center gap-1">
      <span className="text-orange text-sm">−</span>
      <input
        type="number" min={0} step={1000}
        className="input w-32 text-right text-xs py-0.5"
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onBlur={() => { if (v !== value) onSave(v); }}
      />
    </div>
  );
}

/* ── Dialog génération de facture ──────────────────────────────────────── */
function FactureDialog({
  situation: s, siteName, siteReference,
  siteMarcheHt, siteAvanceForfaitaire, siteTvaRate, siteTauxRg,
  prevTotalHt, onClose,
}: {
  situation: Situation; siteName: string; siteReference: string;
  siteMarcheHt: number; siteAvanceForfaitaire: number;
  siteTvaRate: number; siteTauxRg: number;
  prevTotalHt: number; onClose: () => void;
}) {
  const [destinataire, setDestinataire] = useState('');
  const [destinatairePoste, setDestinatairePoste] = useState('');
  const [factureNumero, setFactureNumero] = useState(
    `F-${String(s.numero).padStart(2, '0')}-${new Date().getFullYear()}`,
  );
  const [banque, setBanque] = useState('');
  const [nomClient, setNomClient] = useState('GROUPEMENT CSE CDE');
  const [numeroCompte, setNumeroCompte] = useState('');

  const handleGenerate = async () => {
    const m = await import('@/lib/exportFinance');
    m.exportFactureToPdf(
      {
        name: siteName,
        reference: siteReference,
        marcheHt: siteMarcheHt,
        avanceForfaitaire: siteAvanceForfaitaire,
        tvaRate: siteTvaRate,
        tauxRg: siteTauxRg,
      },
      s,
      prevTotalHt,
      {
        destinataire: destinataire || '—',
        destinatairePoste: destinatairePoste || undefined,
        factureNumero,
        banque: banque || undefined,
        nomClient: nomClient || undefined,
        numeroCompte: numeroCompte || undefined,
      },
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-2 rounded-xl border border-slate-200 shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-navy">Générer la facture de décompte</h3>
          <button className="text-slate-400 hover:text-navy text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        <div className="text-xs text-slate-500 bg-surface-1 rounded-lg px-3 py-2">
          Situation n°{s.numero} · Période {s.periode}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Numéro de facture</label>
            <input className="input w-full" value={factureNumero} onChange={(e) => setFactureNumero(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Attention de (destinataire)</label>
              <input className="input w-full" placeholder="Ex : M. ALIOUNE NDOYE" value={destinataire}
                onChange={(e) => setDestinataire(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Poste / fonction</label>
              <input className="input w-full" placeholder="Ex : MAIRE DE DAKAR PLATEAU" value={destinatairePoste}
                onChange={(e) => setDestinatairePoste(e.target.value)} />
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Coordonnées bancaires</p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Banque</label>
              <input className="input w-full" placeholder="Ex : BRIDGE BANK" value={banque}
                onChange={(e) => setBanque(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nom du client</label>
              <input className="input w-full" value={nomClient}
                onChange={(e) => setNomClient(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Numéro de compte</label>
              <input className="input w-full" placeholder="Ex : 01003 200000019037 08" value={numeroCompte}
                onChange={(e) => setNumeroCompte(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button className="btn-secondary text-sm" onClick={onClose}>Annuler</button>
          <button className="btn-primary text-sm" onClick={() => void handleGenerate()}>
            Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Avenants ──────────────────────────────────────────────────────────── */
function AvenantsSection({
  siteId, marcheHt, avenants, canWrite, onChange,
}: {
  siteId: string;
  marcheHt: number;
  avenants: Avenant[];
  canWrite: boolean;
  onChange: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CreateAvenantPayload>>({});

  const totalAvenants = avenants.reduce((s, a) => s + a.montantHt, 0);
  const montantEffectif = marcheHt + totalAvenants;

  const createMut = useMutation({
    mutationFn: (payload: CreateAvenantPayload) => avenantsApi.create(siteId, payload),
    onSuccess: () => { setShowForm(false); setForm({}); onChange(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAvenantPayload> }) =>
      avenantsApi.update(siteId, id, payload),
    onSuccess: () => { setEditingId(null); setForm({}); onChange(); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => avenantsApi.remove(siteId, id),
    onSuccess: onChange,
  });

  function openEdit(a: Avenant) {
    setEditingId(a.id);
    setForm({
      numero: a.numero,
      objet: a.objet,
      montantHt: a.montantHt,
      dateNotif: a.dateNotif.slice(0, 10),
      dateApprobation: a.dateApprobation?.slice(0, 10),
      notes: a.notes ?? undefined,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMut.mutate({ id: editingId, payload: form });
    } else {
      createMut.mutate(form as CreateAvenantPayload);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy">Avenants au marché</h2>
        {canWrite && !showForm && !editingId && (
          <button onClick={() => { setShowForm(true); setForm({ dateNotif: thisDay(), numero: (avenants.length + 1) }); }} className="btn-secondary text-sm">
            + Avenant
          </button>
        )}
      </div>

      {/* Synthèse */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Marché initial HT</div>
            <div className="font-medium text-navy">{formatFCFA(marcheHt)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Total avenants</div>
            <div className={`font-medium ${totalAvenants >= 0 ? 'text-green' : 'text-red'}`}>
              {totalAvenants >= 0 ? '+' : ''}{formatFCFA(totalAvenants)}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500 mb-0.5">Montant effectif HT</div>
            <div className="font-bold text-navy">{formatFCFA(montantEffectif)}</div>
          </div>
        </div>
      </div>

      {/* Formulaire inline */}
      {(showForm || editingId) && (
        <form onSubmit={handleSubmit} className="card border-2 border-cyan/30 space-y-3">
          <h3 className="font-medium text-navy text-sm">
            {editingId ? 'Modifier l\'avenant' : 'Nouvel avenant'}
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">N° avenant *</label>
              <input type="number" min={1} required className="input w-full text-sm"
                value={form.numero ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, numero: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Montant HT (FCFA) *</label>
              <input type="number" step={1} required className="input w-full text-sm"
                placeholder="Négatif si réduction"
                value={form.montantHt ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, montantHt: Number(e.target.value) }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Objet *</label>
              <input required className="input w-full text-sm"
                value={form.objet ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, objet: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date de notification *</label>
              <input type="date" required className="input w-full text-sm"
                value={form.dateNotif ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dateNotif: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date d'approbation</label>
              <input type="date" className="input w-full text-sm"
                value={form.dateApprobation ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dateApprobation: e.target.value || undefined }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input className="input w-full text-sm"
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || undefined }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary text-sm"
              onClick={() => { setShowForm(false); setEditingId(null); setForm({}); }}>
              Annuler
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={isPending}>
              {isPending ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      {avenants.length === 0 ? (
        <div className="card py-8 text-center text-sm text-slate-400">Aucun avenant.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left pb-2 pr-3">N°</th>
                <th className="text-left pb-2 pr-3">Objet</th>
                <th className="text-right pb-2 pr-3">Montant HT</th>
                <th className="text-left pb-2 pr-3">Notif.</th>
                <th className="text-left pb-2">Approbation</th>
                {canWrite && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {avenants.map((a) => (
                <tr key={a.id} className="hover:bg-surface-1">
                  <td className="py-2 pr-3 font-medium text-navy">A-{a.numero}</td>
                  <td className="py-2 pr-3 text-slate-700 max-w-[220px] truncate">{a.objet}</td>
                  <td className={`py-2 pr-3 text-right font-medium ${a.montantHt >= 0 ? 'text-green' : 'text-red'}`}>
                    {a.montantHt >= 0 ? '+' : ''}{formatFCFA(a.montantHt)}
                  </td>
                  <td className="py-2 pr-3 text-slate-500 text-xs">{a.dateNotif.slice(0, 10)}</td>
                  <td className="py-2 text-xs">
                    {a.dateApprobation ? (
                      <span className="text-green">{a.dateApprobation.slice(0, 10)}</span>
                    ) : (
                      <span className="text-orange">En attente</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="py-2 pl-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(a)} className="text-xs text-cyan-dark hover:underline">
                          Modifier
                        </button>
                        <button
                          onClick={() => { if (confirm('Supprimer cet avenant ?')) removeMut.mutate(a.id); }}
                          disabled={removeMut.isPending}
                          className="text-xs text-slate-400 hover:text-red transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Ligne de décompte ─────────────────────────────────────────────────── */
function LigneRow({ siteId, situationId, ligne: l, locked, onChange }: {
  siteId: string; situationId: string;
  ligne: { id: string; lotCode: string; lotName: string; montantMarcheHt: number; avancementCumul: number; montantHtCumul: number };
  locked: boolean; onChange: () => void;
}) {
  const [avancement, setAvancement] = useState(l.avancementCumul);

  const save = useMutation({
    mutationFn: (v: number) => financeApi.updateLigne(siteId, situationId, l.id, { avancementCumul: v }),
    onSuccess: onChange,
  });

  return (
    <tr className="hover:bg-surface-1">
      <td className="py-2 pr-3">
        <span className="text-cyan-dark font-medium">{l.lotCode}</span>
        <span className="text-slate-500"> · {l.lotName}</span>
      </td>
      <td className="text-right py-2 pr-3 text-slate-600">
        {l.montantMarcheHt > 0 ? formatFCFA(l.montantMarcheHt) : <span className="text-slate-300">—</span>}
      </td>
      <td className="text-right py-2 pr-3">
        {locked ? (
          <span className="font-medium text-navy">{l.avancementCumul} %</span>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <input
              type="number" min={0} max={100} step={0.5}
              className="input w-16 text-right text-xs py-0.5"
              value={avancement}
              onChange={(e) => setAvancement(Number(e.target.value))}
              onBlur={() => { if (avancement !== l.avancementCumul) save.mutate(avancement); }}
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
        )}
      </td>
      <td className="text-right py-2 font-medium text-navy">
        {l.montantHtCumul > 0 ? formatFCFA(l.montantHtCumul) : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  );
}

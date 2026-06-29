import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi, planningApi, type CreateSituationPayload } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import {
  SITUATION_STATUS_LABELS,
  type Role,
  type Situation,
  type SituationStatus,
} from '@/api/types';
import { formatFCFA } from '@/lib/format';

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

const STATUS_NEXT: Record<SituationStatus, { label: string; value: SituationStatus } | null> = {
  BROUILLON: { label: 'Valider', value: 'VALIDEE' },
  VALIDEE: { label: 'Marquer payée', value: 'PAYEE' },
  PAYEE: null,
};

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function thisDay(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  const { data: situations, isLoading } = useQuery({
    queryKey: ['finance', siteId],
    queryFn: () => financeApi.listSituations(siteId),
  });

  const { data: lots } = useQuery({
    queryKey: ['planning', siteId],
    queryFn: () => planningApi.listLots(siteId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['planning', siteId] });
    void queryClient.invalidateQueries({ queryKey: ['site', siteId, 'kpi'] });
  };

  if (isLoading) return <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>;

  const totalBudgetLots = lots?.reduce((a, l) => a + l.montantMarcheHt, 0) ?? 0;

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
          {situations?.map((s) => (
            <SituationCard
              key={s.id}
              siteId={siteId}
              siteName={siteName}
              siteReference={siteReference}
              situation={s}
              open={openId === s.id}
              onToggle={() => setOpenId((v) => (v === s.id ? null : s.id))}
              canWrite={canWrite}
              onChange={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Budget par lot ────────────────────────────────────────────────────── */

function LotBudgetRow({
  siteId,
  lotId,
  code,
  name,
  montantMarcheHt,
  canWrite,
  onChange,
}: {
  siteId: string;
  lotId: string;
  code: string;
  name: string;
  montantMarcheHt: number;
  canWrite: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(montantMarcheHt));

  const save = useMutation({
    mutationFn: () => financeApi.updateLotBudget(siteId, lotId, Number(val)),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-cyan-dark font-medium w-16 shrink-0">{code}</span>
      <span className="flex-1 text-navy truncate">{name}</span>
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input
            type="number"
            min={0}
            step={1}
            className="input w-36 text-right text-xs"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary text-xs px-2 py-1">OK</button>
          <button type="button" className="btn-secondary text-xs px-2 py-1" onClick={() => setEditing(false)}>✕</button>
        </form>
      ) : (
        <span
          className={`font-medium ${montantMarcheHt > 0 ? 'text-navy' : 'text-slate-400'} ${canWrite ? 'cursor-pointer hover:text-cyan-dark' : ''}`}
          onClick={() => canWrite && setEditing(true)}
          title={canWrite ? 'Cliquer pour modifier' : undefined}
        >
          {montantMarcheHt > 0 ? formatFCFA(montantMarcheHt) : canWrite ? '— cliquer pour saisir' : '—'}
        </span>
      )}
    </div>
  );
}

/* ── Formulaire création situation ────────────────────────────────────── */

function CreateSituationForm({
  siteId,
  nextNumero,
  onSuccess,
}: {
  siteId: string;
  nextNumero: number;
  onSuccess: () => void;
}) {
  const [numero, setNumero] = useState(nextNumero);
  const [periode, setPeriode] = useState(thisMonth());
  const [dateEmission, setDateEmission] = useState(thisDay());
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateSituationPayload = {
        numero,
        periode,
        dateEmission,
        notes: notes || undefined,
      };
      return financeApi.createSituation(siteId, payload);
    },
    onSuccess,
  });

  return (
    <form
      className="card flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div>
        <label className="block text-xs text-slate-500 mb-1">N° situation</label>
        <input
          type="number"
          min={1}
          className="input w-20"
          value={numero}
          onChange={(e) => setNumero(Number(e.target.value))}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Période</label>
        <input
          type="month"
          className="input w-36"
          value={periode}
          onChange={(e) => setPeriode(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Date d'émission</label>
        <input
          type="date"
          className="input w-36"
          value={dateEmission}
          onChange={(e) => setDateEmission(e.target.value)}
          required
        />
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <input
          className="input"
          placeholder="Optionnel"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={create.isPending}>
        {create.isPending ? 'Création…' : 'Créer'}
      </button>
    </form>
  );
}

/* ── Carte Situation ───────────────────────────────────────────────────── */

function SituationCard({
  siteId,
  siteName,
  siteReference,
  situation: s,
  open,
  onToggle,
  canWrite,
  onChange,
}: {
  siteId: string;
  siteName: string;
  siteReference: string;
  situation: Situation;
  open: boolean;
  onToggle: () => void;
  canWrite: boolean;
  onChange: () => void;
}) {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: (status: SituationStatus) =>
      financeApi.updateSituation(siteId, s.id, { status }),
    onSuccess: () => {
      onChange();
      void queryClient.invalidateQueries({ queryKey: ['finance', siteId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => financeApi.deleteSituation(siteId, s.id),
    onSuccess: onChange,
  });

  const next = STATUS_NEXT[s.status];

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-lg leading-none text-navy hover:bg-surface-1"
            aria-label={open ? 'Réduire' : 'Développer'}
          >
            {open ? '−' : '+'}
          </button>
          <div className="min-w-0">
            <div className="font-medium text-navy">
              Situation n° {s.numero}
              <span className="text-slate-400 font-normal"> · {s.periode}</span>
            </div>
            <div className="text-xs text-slate-500">
              Émise le {s.dateEmission.slice(0, 10)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-navy">{formatFCFA(s.totalHt)} HT</div>
            <div className="text-xs text-slate-500">{formatFCFA(s.totalTtc)} TTC</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[s.status]}`}>
            {SITUATION_STATUS_LABELS[s.status]}
          </span>
          {canWrite && next && (
            <button
              className="btn-secondary text-xs"
              onClick={() => updateStatus.mutate(next.value)}
              disabled={updateStatus.isPending}
            >
              {next.label}
            </button>
          )}
          {canWrite && s.status === 'BROUILLON' && (
            <button
              className="text-xs text-red hover:underline"
              onClick={() => remove.mutate()}
            >
              Supprimer
            </button>
          )}
          <button
            className="btn-secondary text-xs"
            onClick={async () => {
              const m = await import('@/lib/exportFinance');
              m.exportSituationToPdf({ name: siteName, reference: siteReference }, s);
            }}
            title="Télécharger la situation en PDF"
          >
            PDF
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left pb-2 pr-3">Lot</th>
                  <th className="text-right pb-2 pr-3 w-32">Marché HT</th>
                  <th className="text-right pb-2 pr-3 w-24">Avanct. %</th>
                  <th className="text-right pb-2 w-36">Montant HT cumul</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.lignes.map((l) => (
                  <LigneRow
                    key={l.id}
                    siteId={siteId}
                    situationId={s.id}
                    ligne={l}
                    locked={s.status !== 'BROUILLON' || !canWrite}
                    onChange={onChange}
                  />
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300">
                <tr className="font-semibold text-navy">
                  <td className="pt-2 pr-3">TOTAL</td>
                  <td className="text-right pt-2 pr-3">
                    {formatFCFA(s.lignes.reduce((a, l) => a + l.montantMarcheHt, 0))}
                  </td>
                  <td />
                  <td className="text-right pt-2">{formatFCFA(s.totalHt)}</td>
                </tr>
                <tr className="text-xs text-slate-500">
                  <td colSpan={3} className="pt-1 pr-3">
                    TVA ({(s.tvaRate * 100).toFixed(0)} %)
                  </td>
                  <td className="text-right pt-1">{formatFCFA(s.totalTva)}</td>
                </tr>
                <tr className="text-sm font-bold text-cyan-dark border-t border-slate-200">
                  <td colSpan={3} className="pt-2 pr-3">TOTAL TTC</td>
                  <td className="text-right pt-2">{formatFCFA(s.totalTtc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Ligne de décompte ─────────────────────────────────────────────────── */

function LigneRow({
  siteId,
  situationId,
  ligne: l,
  locked,
  onChange,
}: {
  siteId: string;
  situationId: string;
  ligne: { id: string; lotCode: string; lotName: string; montantMarcheHt: number; avancementCumul: number; montantHtCumul: number };
  locked: boolean;
  onChange: () => void;
}) {
  const [avancement, setAvancement] = useState(l.avancementCumul);

  const save = useMutation({
    mutationFn: (v: number) =>
      financeApi.updateLigne(siteId, situationId, l.id, { avancementCumul: v }),
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
              type="number"
              min={0}
              max={100}
              step={0.5}
              className="input w-16 text-right text-xs py-0.5"
              value={avancement}
              onChange={(e) => setAvancement(Number(e.target.value))}
              onBlur={() => {
                if (avancement !== l.avancementCumul) save.mutate(avancement);
              }}
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

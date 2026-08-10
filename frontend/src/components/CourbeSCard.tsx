import { useQuery } from '@tanstack/react-query';
import { planningApi } from '@/api/endpoints';
import { formatFCFA } from '@/lib/format';

/**
 * Courbe en S : avancement planifié (d'après les dates du planning) face à
 * l'avancement financier constaté sur les attachements mensuels.
 */
export function CourbeSCard({ siteId }: { siteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['courbe-s', siteId],
    queryFn: () => planningApi.courbeS(siteId),
  });

  if (isLoading) {
    return <div className="card"><p className="text-sm text-slate-400">Chargement de la courbe…</p></div>;
  }
  if (!data || data.courbe.length === 0) {
    return (
      <div className="card">
        <h2 className="font-semibold text-navy mb-2">Courbe en S</h2>
        <p className="text-sm text-slate-400">Aucune donnée d'avancement disponible.</p>
      </div>
    );
  }

  const W = 720, H = 240, ML = 38, MB = 26, MT = 10, MR = 10;
  const pts = data.courbe;
  const n = pts.length;
  const x = (i: number) => ML + (i / Math.max(1, n - 1)) * (W - ML - MR);
  const y = (pct: number) => MT + (1 - pct / 100) * (H - MT - MB);

  const ligne = (sel: (p: typeof pts[0]) => number | null) => {
    const seg: string[] = [];
    let ouvert = false;
    pts.forEach((p, i) => {
      const v = sel(p);
      if (v === null || v === undefined) { ouvert = false; return; }
      seg.push(`${ouvert ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      ouvert = true;
    });
    return seg.join(' ');
  };

  const releves = pts.map((p, i) => ({ p, i })).filter((o) => o.p.realisePct !== null);
  const spi = data.spi;
  const enRetard = spi !== null && spi < 1;
  const d = data.dernierReleve;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-semibold text-navy">Courbe en S — avancement</h2>
          <p className="text-xs text-slate-400">
            Planifié d'après {data.nbTachesDatees} tâches datées · réalisé sur{' '}
            {data.nbPointsReleves} attachements
          </p>
        </div>
        {spi !== null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">SPI</div>
            <div className={`text-2xl font-bold ${enRetard ? 'text-red' : 'text-green'}`}>
              {spi.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400">
              {enRetard ? 'en retard sur le planning' : 'conforme ou en avance'}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img"
             aria-label="Courbe en S : avancement planifié et réalisé">
          {/* grille horizontale */}
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={ML} y1={y(g)} x2={W - MR} y2={y(g)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={ML - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{g} %</text>
            </g>
          ))}
          {/* axe des mois (1 sur 3) */}
          {pts.map((p, i) => (i % 3 === 0 ? (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={8} fill="#94a3b8">
              {p.mois.slice(5)}/{p.mois.slice(2, 4)}
            </text>
          ) : null))}

          {/* planifié */}
          <path d={ligne((p) => p.planifiePct)} fill="none" stroke="#003366"
                strokeWidth={2} strokeDasharray="5 3" />
          {/* réalisé */}
          <path d={ligne((p) => p.realisePct)} fill="none" stroke="#00AEEF" strokeWidth={2.5} />
          {releves.map(({ p, i }) => (
            <circle key={p.date} cx={x(i)} cy={y(p.realisePct!)} r={3.5} fill="#00AEEF">
              <title>{`${p.libelle} — ${p.realisePct} % (${formatFCFA(p.realiseHt ?? 0)})`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100">
        <span><span className="inline-block w-4 h-0 border-t-2 border-dashed border-navy mr-1 align-middle" />Planifié</span>
        <span><span className="inline-block w-4 h-0 border-t-2 border-cyan mr-1 align-middle" />Réalisé (attachements)</span>
        {d && (
          <span className="ml-auto">
            Dernier relevé {d.mois} : <strong className="text-navy">{d.realisePct} %</strong>
            {' '}contre {d.planifiePct} % prévu
          </span>
        )}
      </div>

      {data.nbTachesDatees > 0 && pts[0]?.planifiePct === 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5 mt-2">
          ⚠️ Le planning détaillé ne couvre pas toute la durée du chantier : la
          courbe planifiée démarre tardivement, ce qui fausse le SPI sur les
          premiers mois.
        </p>
      )}
    </div>
  );
}

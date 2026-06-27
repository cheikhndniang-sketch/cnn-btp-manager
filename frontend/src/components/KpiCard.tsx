interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: 'cyan' | 'navy' | 'green' | 'orange' | 'red';
  hint?: string;
}

const ACCENTS: Record<NonNullable<KpiCardProps['accent']>, string> = {
  cyan: 'text-cyan',
  navy: 'text-navy',
  green: 'text-green',
  orange: 'text-orange',
  red: 'text-red',
};

export function KpiCard({ label, value, accent = 'navy', hint }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className={`text-2xl font-bold ${ACCENTS[accent]}`}>{value}</span>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

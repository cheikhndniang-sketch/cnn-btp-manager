import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { ALERT_TYPE_LABELS, ROLE_LABELS, type AppAlert } from '@/api/types';
import { dashboardApi } from '@/api/endpoints';
import { Logo } from './Logo';

const NAV_ITEMS = [
  { label: 'Chantiers', to: '/dashboard', enabled: true },
  { label: 'Planning', to: '#', enabled: false },
  { label: 'Finance', to: '#', enabled: false },
  { label: 'Sous-traitance', to: '#', enabled: false },
  { label: 'Documents', to: '#', enabled: false },
];

// ── Bell icon SVG ─────────────────────────────────────────────────────
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

// ── Alert type config ─────────────────────────────────────────────────
function alertIcon(type: AppAlert['type']) {
  if (type === 'TASKS_LATE') return '⚠️';
  if (type === 'SITUATION_BROUILLON') return '📋';
  return '📝';
}

function alertDesc(a: AppAlert) {
  if (a.type === 'TASKS_LATE')
    return `${a.count} tâche${a.count > 1 ? 's' : ''} en retard`;
  if (a.type === 'SITUATION_BROUILLON')
    return `${a.count} situation${a.count > 1 ? 's' : ''} en brouillon`;
  return `${a.count} TS en attente de validation`;
}

// ── Alerts bell + dropdown ────────────────────────────────────────────
function AlertsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: dashboardApi.alerts,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    staleTime: 2 * 60 * 1000,
  });

  const warnings = alerts.filter((a) => a.severity === 'WARNING');
  const total = alerts.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-navy hover:border-slate-300 transition-colors"
        aria-label="Alertes"
      >
        <BellIcon className="w-5 h-5" />
        {total > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-0.5 ${
            warnings.length > 0 ? 'bg-red' : 'bg-cyan'
          }`}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-navy">Alertes</span>
            {total > 0 && (
              <span className="text-xs text-slate-400">{total} alerte{total > 1 ? 's' : ''}</span>
            )}
          </div>

          {total === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              <div className="text-2xl mb-2">✓</div>
              Aucune alerte en cours
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link
                    to={`/sites/${a.siteId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-surface-0 transition-colors"
                  >
                    <span className="text-base mt-0.5 flex-shrink-0">{alertIcon(a.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-navy truncate">
                        {a.siteReference} — {a.siteName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className={`font-medium ${a.severity === 'WARNING' ? 'text-red' : 'text-cyan'}`}>
                          {ALERT_TYPE_LABELS[a.type]}
                        </span>
                        {' · '}{alertDesc(a)}
                      </p>
                    </div>
                    <span className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                      a.severity === 'WARNING' ? 'bg-red' : 'bg-cyan'
                    }`} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-slate-100 bg-surface-0">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="text-xs text-cyan hover:underline"
            >
              Voir tous les chantiers →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────
export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const close = () => setMenuOpen(false);

  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* Voile mobile */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={close}
          aria-hidden
        />
      )}

      <aside
        className={`sidebar fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-white/10">
          <Logo variant="light" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.label}
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-cyan text-white' : 'text-white/80 hover:bg-navy-light'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <div
                key={item.label}
                title="Disponible en Phase 2"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-white/40 cursor-not-allowed"
              >
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">Phase 2</span>
              </div>
            ),
          )}
        </nav>
        {user?.role === 'ADMIN' && (
          <div className="p-3 border-t border-white/10">
            <NavLink
              to="/admin/users"
              onClick={close}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-cyan text-white' : 'text-white/80 hover:bg-navy-light'
                }`
              }
            >
              Utilisateurs
            </NavLink>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between bg-white border-b border-slate-200 px-4 sm:px-6 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-navy"
              aria-label="Menu"
            >
              <span className="text-xl leading-none">☰</span>
            </button>
            <Logo size={32} showText={false} />
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <AlertsBell />
            <Link
              to="/profile"
              className="text-right leading-tight min-w-0 hidden sm:block hover:opacity-70 transition-opacity"
            >
              <div className="text-sm font-medium text-navy truncate">{user?.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {user ? ROLE_LABELS[user.role] : ''}
              </div>
            </Link>
            <button onClick={handleLogout} className="btn-secondary text-sm whitespace-nowrap">
              Déconnexion
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

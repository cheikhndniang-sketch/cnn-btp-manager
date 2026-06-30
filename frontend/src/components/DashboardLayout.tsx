import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/api/types';
import { Logo } from './Logo';

const NAV_ITEMS = [
  { label: 'Chantiers', to: '/dashboard', enabled: true },
  { label: 'Planning', to: '#', enabled: false },
  { label: 'Finance', to: '#', enabled: false },
  { label: 'Sous-traitance', to: '#', enabled: false },
  { label: 'Documents', to: '#', enabled: false },
];

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

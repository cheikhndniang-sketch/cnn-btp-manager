import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-surface-0">
      <aside className="sidebar">
        <div className="p-5 border-b border-white/10">
          <Logo variant="light" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) =>
            item.enabled ? (
              <NavLink
                key={item.label}
                to={item.to}
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
        <header className="sticky top-0 z-10 flex items-center justify-between bg-white border-b border-slate-200 px-6 py-3">
          <Logo size={32} showText={false} />
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-navy">{user?.name}</div>
              <div className="text-xs text-slate-500">
                {user ? ROLE_LABELS[user.role] : ''}
              </div>
            </div>
            <button onClick={handleLogout} className="btn-secondary text-sm">
              Déconnexion
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

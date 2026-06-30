import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/endpoints';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ROLE_LABELS, type Role, type User } from '@/api/types';
import { useAuth } from '@/hooks/useAuth';

const ROLES: Role[] = [
  'ADMIN',
  'DIRECTEUR_PROJET',
  'DIRECTEUR_TRAVAUX',
  'CONDUCTEUR_TRAVAUX',
];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', roleFilter, activeFilter],
    queryFn: () =>
      usersApi.list({
        role: roleFilter || undefined,
        isActive: activeFilter === '' ? undefined : activeFilter === 'true',
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<User> }) =>
      usersApi.update(id, payload),
    onSuccess: invalidate,
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: invalidate,
  });

  const filtered = (users ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  });

  const totalActive = (users ?? []).filter((u) => u.isActive).length;
  const totalInactive = (users ?? []).filter((u) => !u.isActive).length;
  const pendingPwd = (users ?? []).filter((u) => u.mustChangePassword && u.isActive).length;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Utilisateurs</h1>
          <p className="text-sm text-slate-500">Gestion des comptes et des rôles</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Nouvel utilisateur
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green">{totalActive}</p>
          <p className="text-xs text-slate-500 mt-1">Actifs</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-slate-400">{totalInactive}</p>
          <p className="text-xs text-slate-500 mt-1">Inactifs</p>
        </div>
        <div className="card p-4 text-center">
          <p className={`text-2xl font-bold ${pendingPwd > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
            {pendingPwd}
          </p>
          <p className="text-xs text-slate-500 mt-1">Mdp à changer</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="input max-w-[240px]"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[220px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <select
          className="input max-w-[180px]"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Aucun utilisateur</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Identifiant</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Rôle</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Dernière connexion</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-surface-0">
                  <td className="py-3 pr-4">
                    <span className="font-medium text-navy">{u.name}</span>
                    {u.mustChangePassword && u.isActive && (
                      <span className="ml-2 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        mdp temp
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600 font-mono text-xs">{u.username}</td>
                  <td className="py-3 pr-4 text-slate-500">{u.email ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) =>
                        updateMutation.mutate({ id: u.id, payload: { role: e.target.value as Role } })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        u.isActive ? 'bg-green-light text-green' : 'bg-red-light text-red'
                      }`}
                    >
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 text-xs whitespace-nowrap">
                    {fmtDate(u.lastLogin)}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <button
                        className="text-xs text-cyan hover:underline"
                        onClick={() => setEditUser(u)}
                      >
                        Modifier
                      </button>
                      <button
                        className="text-xs text-slate-500 hover:underline"
                        onClick={() => setResetUser(u)}
                      >
                        Réinit. mdp
                      </button>
                      {u.isActive ? (
                        <button
                          className="text-xs text-red hover:underline disabled:opacity-40"
                          disabled={u.id === me?.id}
                          onClick={() => deactivateMutation.mutate(u.id)}
                        >
                          Désactiver
                        </button>
                      ) : (
                        <button
                          className="text-xs text-green hover:underline"
                          onClick={() => updateMutation.mutate({ id: u.id, payload: { isActive: true } })}
                        >
                          Réactiver
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { invalidate(); setShowCreate(false); }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { invalidate(); setEditUser(null); }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
    </DashboardLayout>
  );
}

// ── Create user ──────────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ username: '', name: '', email: '', role: 'CONDUCTEUR_TRAVAUX' as Role });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.create({ username: form.username, name: form.name, email: form.email || undefined, role: form.role }),
    onSuccess: (data) => setTempPassword(data.temporaryPassword),
    onError: () => setError("Impossible de créer l'utilisateur (identifiant déjà pris ?)."),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        {tempPassword ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-navy">Utilisateur créé</h2>
            <p className="text-sm text-slate-600">Mot de passe temporaire (affiché une seule fois) :</p>
            <code className="block rounded-lg bg-surface-0 border border-slate-200 px-3 py-2 text-navy font-mono text-sm">
              {tempPassword}
            </code>
            <button className="btn-primary w-full" onClick={onCreated}>Terminer</button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}>
            <h2 className="text-lg font-bold text-navy">Nouvel utilisateur</h2>
            {error && <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">{error}</div>}
            <input className="input" placeholder="Identifiant" required minLength={3}
              value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input className="input" placeholder="Nom complet" required minLength={2}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" type="email" placeholder="Email (optionnel)"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
                {mutation.isPending ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Edit user ────────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user.name, email: user.email ?? '' });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.update(user.id, { name: form.name, email: form.email || undefined }),
    onSuccess: onSaved,
    onError: () => setError('Impossible de modifier le compte.'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}>
          <h2 className="text-lg font-bold text-navy">Modifier — {user.username}</h2>
          {error && <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">{error}</div>}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Nom complet</label>
            <input className="input" required minLength={2}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Email</label>
            <input className="input" type="email" placeholder="(optionnel)"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset password ───────────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: () => usersApi.resetPassword(user.id),
    onSuccess: (data) => setTempPassword(data.temporaryPassword),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        {tempPassword ? (
          <>
            <h2 className="text-lg font-bold text-navy">Mot de passe réinitialisé</h2>
            <p className="text-sm text-slate-600">
              Nouveau mot de passe temporaire pour <strong>{user.name}</strong> (affiché une seule fois) :
            </p>
            <code className="block rounded-lg bg-surface-0 border border-slate-200 px-3 py-2 text-navy font-mono text-sm">
              {tempPassword}
            </code>
            <p className="text-xs text-slate-500">
              L'utilisateur devra le changer à sa prochaine connexion. Ses sessions actives ont été invalidées.
            </p>
            <button className="btn-primary w-full" onClick={onClose}>Fermer</button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-navy">Réinitialiser le mot de passe</h2>
            <p className="text-sm text-slate-600">
              Ceci génèrera un nouveau mot de passe temporaire pour <strong>{user.name}</strong> et
              invalidera toutes ses sessions en cours.
            </p>
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              Je confirme vouloir réinitialiser le mot de passe de cet utilisateur.
            </label>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
              <button
                className="btn-primary flex-1 disabled:opacity-40"
                disabled={!confirmed || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? 'Réinitialisation…' : 'Réinitialiser'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

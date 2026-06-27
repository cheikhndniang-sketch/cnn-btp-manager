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

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', roleFilter, activeFilter],
    queryFn: () =>
      usersApi.list({
        role: roleFilter || undefined,
        isActive: activeFilter === '' ? undefined : activeFilter === 'true',
      }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['users'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<User> }) =>
      usersApi.update(id, payload),
    onSuccess: invalidate,
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: invalidate,
  });

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Utilisateurs</h1>
          <p className="text-sm text-slate-500">Gestion des comptes et des rôles</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          + Nouvel utilisateur
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="input max-w-[220px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
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
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Identifiant</th>
                <th className="py-2 pr-4">Rôle</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-navy">{u.name}</td>
                  <td className="py-3 pr-4 text-slate-600">{u.username}</td>
                  <td className="py-3 pr-4">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) =>
                        updateMutation.mutate({
                          id: u.id,
                          payload: { role: e.target.value as Role },
                        })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        u.isActive
                          ? 'bg-green-light text-green'
                          : 'bg-red-light text-red'
                      }`}
                    >
                      {u.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
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
                        onClick={() =>
                          updateMutation.mutate({
                            id: u.id,
                            payload: { isActive: true },
                          })
                        }
                      >
                        Réactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <CreateUserModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            invalidate();
            setShowModal(false);
          }}
        />
      )}
    </DashboardLayout>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    username: '',
    name: '',
    email: '',
    role: 'CONDUCTEUR_TRAVAUX' as Role,
  });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.create({
        username: form.username,
        name: form.name,
        email: form.email || undefined,
        role: form.role,
      }),
    onSuccess: (data) => setTempPassword(data.temporaryPassword),
    onError: () =>
      setError("Impossible de créer l'utilisateur (identifiant déjà pris ?)."),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        {tempPassword ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-navy">Utilisateur créé</h2>
            <p className="text-sm text-slate-600">
              Mot de passe temporaire (affiché une seule fois) :
            </p>
            <code className="block rounded-lg bg-surface-0 border border-slate-200 px-3 py-2 text-navy font-mono">
              {tempPassword}
            </code>
            <button className="btn-primary w-full" onClick={onCreated}>
              Terminer
            </button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate();
            }}
          >
            <h2 className="text-lg font-bold text-navy">Nouvel utilisateur</h2>
            {error && (
              <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <input
              className="input"
              placeholder="Identifiant"
              required
              minLength={3}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              className="input"
              placeholder="Nom complet"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="input"
              type="email"
              placeholder="Email (optionnel)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary flex-1" onClick={onClose}>
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

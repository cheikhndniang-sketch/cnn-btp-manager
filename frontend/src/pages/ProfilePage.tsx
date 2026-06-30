import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ROLE_LABELS } from '@/api/types';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Requis'),
    newPassword: z
      .string()
      .min(8, 'Au moins 8 caractères')
      .regex(/[A-Z]/, 'Une majuscule requise')
      .regex(/[a-z]/, 'Une minuscule requise')
      .regex(/[0-9]/, 'Un chiffre requis'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Le nouveau mot de passe doit être différent de l\'actuel',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

function fmtDate(iso: string | null) {
  if (!iso) return 'Jamais';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return (
    <div className="w-16 h-16 rounded-full bg-cyan flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
      {letters}
    </div>
  );
}

export function ProfilePage() {
  const { user, login } = useAuth();
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setPwdError(null);
    setPwdSuccess(false);
    if (!user) return;
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      await login(user.username, values.newPassword);
      reset();
      setPwdSuccess(true);
    } catch {
      setPwdError('Mot de passe actuel incorrect ou nouveau mot de passe invalide.');
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Mon profil</h1>
          <p className="text-sm text-slate-500">Informations de compte et sécurité</p>
        </div>

        {/* User info card */}
        <div className="card p-6">
          <div className="flex items-start gap-5">
            <Initials name={user.name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-navy">{user.name}</h2>
                {user.mustChangePassword && (
                  <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    Mot de passe temporaire
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">@{user.username}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Info label="Rôle" value={ROLE_LABELS[user.role]} />
            <Info label="Email" value={user.email ?? '—'} />
            <Info label="Dernière connexion" value={fmtDate(user.lastLogin)} />
            <Info
              label="Statut"
              value={
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  user.isActive ? 'bg-green-light text-green' : 'bg-red-light text-red'
                }`}>
                  {user.isActive ? 'Actif' : 'Inactif'}
                </span>
              }
            />
          </div>
        </div>

        {/* Change password card */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-navy mb-4">Changer le mot de passe</h3>

          {pwdSuccess && (
            <div className="rounded-lg bg-green-light text-green px-3 py-2 text-sm mb-4">
              Mot de passe mis à jour avec succès.
            </div>
          )}
          {pwdError && (
            <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm mb-4">
              {pwdError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <PwdField
              id="currentPassword"
              label="Mot de passe actuel"
              error={errors.currentPassword?.message}
              reg={register('currentPassword')}
              autoComplete="current-password"
            />
            <PwdField
              id="newPassword"
              label="Nouveau mot de passe"
              error={errors.newPassword?.message}
              reg={register('newPassword')}
              autoComplete="new-password"
            />
            <PwdField
              id="confirm"
              label="Confirmer le nouveau mot de passe"
              error={errors.confirm?.message}
              reg={register('confirm')}
              autoComplete="new-password"
            />
            <p className="text-xs text-slate-400">
              Min. 8 caractères · 1 majuscule · 1 minuscule · 1 chiffre
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-navy">{value}</p>
    </div>
  );
}

function PwdField({
  id,
  label,
  error,
  reg,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  reg: ReturnType<ReturnType<typeof useForm>['register']>;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        className="input"
        {...reg}
      />
      {error && <p className="mt-1 text-xs text-red">{error}</p>}
    </div>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/Logo';

const schema = z
  .object({
    currentPassword: z.string().min(8, 'Au moins 8 caractères'),
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
    message: 'Le nouveau mot de passe doit être différent',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const forced = user?.mustChangePassword ?? false;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    if (!user) return;
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      // Le changement invalide les sessions : on rétablit une session complète
      // (nouveau access_token + cookie refresh) avec le nouveau mot de passe.
      await login(user.username, values.newPassword);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Mot de passe actuel incorrect ou nouveau mot de passe invalide.');
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo size={56} variant="light" />
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-2xl shadow-xl p-8 space-y-5"
          noValidate
        >
          <div>
            <h1 className="text-xl font-bold text-navy">Changer le mot de passe</h1>
            <p className="text-sm text-slate-500">
              {forced
                ? 'Première connexion : définissez un nouveau mot de passe pour continuer.'
                : 'Mettez à jour votre mot de passe.'}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <Field
            id="currentPassword"
            label="Mot de passe actuel"
            error={errors.currentPassword?.message}
            register={register('currentPassword')}
            autoComplete="current-password"
          />
          <Field
            id="newPassword"
            label="Nouveau mot de passe"
            error={errors.newPassword?.message}
            register={register('newPassword')}
            autoComplete="new-password"
          />
          <Field
            id="confirm"
            label="Confirmer le nouveau mot de passe"
            error={errors.confirm?.message}
            register={register('confirm')}
            autoComplete="new-password"
          />

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? 'Enregistrement…' : 'Mettre à jour'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  register,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  register: ReturnType<ReturnType<typeof useForm>['register']>;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy mb-1">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        className="input"
        {...register}
      />
      {error && <p className="mt-1 text-xs text-red">{error}</p>}
    </div>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/Logo';

const schema = z.object({
  username: z.string().min(3, 'Au moins 3 caractères'),
  password: z.string().min(8, 'Au moins 8 caractères'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.username, values.password);
      navigate('/dashboard', { replace: true });
    } catch {
      // Message d'erreur générique (ne révèle pas la cause exacte).
      setError('Identifiants invalides. Veuillez réessayer.');
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
            <h1 className="text-xl font-bold text-navy">Connexion</h1>
            <p className="text-sm text-slate-500">
              Accédez à votre espace de gestion de chantiers.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-navy mb-1">
              Nom d'utilisateur
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="input"
              {...register('username')}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-navy mb-1">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red">{errors.password.message}</p>
            )}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-white/60 text-xs mt-6">
          © {new Date().getFullYear()} CSE Immobilier — Dakar, Sénégal
        </p>
      </div>
    </div>
  );
}

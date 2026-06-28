import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sitesApi, type CreateSitePayload } from '@/api/endpoints';

export function CreateSiteModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    reference: '',
    name: '',
    location: '',
    marcheHt: '',
    tvaRate: '0.18',
    startDate: '',
    endDatePlanned: '',
    description: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => {
      const payload: CreateSitePayload = {
        reference: form.reference.trim(),
        name: form.name.trim(),
        location: form.location.trim() || undefined,
        marcheHt: Number(form.marcheHt || 0),
        tvaRate: form.tvaRate ? Number(form.tvaRate) : undefined,
        startDate: form.startDate,
        endDatePlanned: form.endDatePlanned || undefined,
        description: form.description.trim() || undefined,
      };
      return sitesApi.create(payload);
    },
    onSuccess: (site) => navigate(`/sites/${site.id}`),
    onError: () =>
      setError('Création impossible (référence déjà utilisée ou champs invalides).'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          <div>
            <h2 className="text-lg font-bold text-navy">Nouveau chantier</h2>
            <p className="text-sm text-slate-500">
              Créez le projet, puis construisez son planning dans l'onglet Planning.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-light text-red px-3 py-2 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Référence *">
              <input
                className="input"
                required
                placeholder="SAN-2025-002"
                value={form.reference}
                onChange={(e) => set('reference', e.target.value)}
              />
            </Field>
            <Field label="Localisation">
              <input
                className="input"
                placeholder="Dakar, Sénégal"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Nom du projet *">
            <input
              className="input"
              required
              minLength={3}
              placeholder="Construction de…"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marché HT (FCFA) *">
              <input
                className="input"
                type="number"
                required
                min={0}
                placeholder="6000000000"
                value={form.marcheHt}
                onChange={(e) => set('marcheHt', e.target.value)}
              />
            </Field>
            <Field label="Taux de TVA">
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={form.tvaRate}
                onChange={(e) => set('tvaRate', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de début *">
              <input
                className="input"
                type="date"
                required
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
            </Field>
            <Field label="Fin prévue">
              <input
                className="input"
                type="date"
                value={form.endDatePlanned}
                onChange={(e) => set('endDatePlanned', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Description">
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer le chantier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-navy mb-1">{label}</span>
      {children}
    </label>
  );
}

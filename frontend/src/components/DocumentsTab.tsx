import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/api/endpoints';
import { enqueuePhoto, syncPhotos } from '@/lib/photoQueue';
import { useAuth } from '@/hooks/useAuth';
import {
  DOC_CATEGORIE_LABELS,
  type DocCategorie,
  type Document,
  type Role,
} from '@/api/types';
import { formatDate } from '@/lib/format';

const WRITER_ROLES: Role[] = ['ADMIN', 'DIRECTEUR_PROJET', 'DIRECTEUR_TRAVAUX'];

const ALL_CATEGORIES: DocCategorie[] = [
  'PV',
  'COMPTE_RENDU',
  'ATTACHEMENT',
  'FACTURE',
  'PLAN',
  'PHOTO',
  'CONTRAT',
  'COURRIER',
  'AUTRE',
];

const CAT_BADGE: Record<DocCategorie, string> = {
  PV: 'bg-cyan/10 text-cyan-dark',
  COMPTE_RENDU: 'bg-purple-100 text-purple-700',
  ATTACHEMENT: 'bg-slate-100 text-slate-600',
  FACTURE: 'bg-yellow-100 text-yellow-700',
  PLAN: 'bg-blue-100 text-blue-700',
  PHOTO: 'bg-pink-100 text-pink-700',
  CONTRAT: 'bg-orange-100 text-orange-700',
  COURRIER: 'bg-green-light text-green',
  AUTRE: 'bg-slate-100 text-slate-500',
};

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} Mo`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`;
  return `${bytes} o`;
}

function fileIcon(mimetype: string): string {
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype === 'application/pdf') return '📄';
  if (mimetype.includes('word')) return '📝';
  if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
  if (mimetype.includes('zip') || mimetype.includes('compressed')) return '🗜️';
  return '📎';
}

interface Props {
  siteId: string;
}

export function DocumentsTab({ siteId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canWrite = user ? WRITER_ROLES.includes(user.role as Role) : false;

  const [catFilter, setCatFilter] = useState<DocCategorie | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);

  const docsQuery = useQuery({
    queryKey: ['documents', siteId, catFilter],
    queryFn: () => documentsApi.list(siteId, catFilter),
  });

  const docs = docsQuery.data ?? [];

  const removeMut = useMutation({
    mutationFn: (docId: string) => documentsApi.remove(siteId, docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents', siteId] }),
  });

  const handleDownload = (doc: Document) => {
    documentsApi.download(siteId, doc.id, doc.nom);
  };

  return (
    <div className="space-y-4">
      {/* Filters + action bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setCatFilter(undefined)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              catFilter === undefined
                ? 'bg-navy text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous
          </button>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat === catFilter ? undefined : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                catFilter === cat
                  ? 'bg-navy text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {DOC_CATEGORIE_LABELS[cat]}
            </button>
          ))}
        </div>
        {canWrite && (
          <button
            onClick={() => setShowUpload(true)}
            className="btn-primary text-sm"
          >
            + Ajouter un document
          </button>
        )}
      </div>

      {/* Document list */}
      {docsQuery.isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
      ) : docs.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-slate-400 text-sm">Aucun document{catFilter ? ' dans cette catégorie' : ''}.</p>
          {canWrite && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 btn-primary text-sm"
            >
              + Ajouter un document
            </button>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-medium text-slate-500 w-8"></th>
                <th className="px-4 py-3 font-medium text-slate-500">Nom</th>
                <th className="px-4 py-3 font-medium text-slate-500">Catégorie</th>
                <th className="px-4 py-3 font-medium text-slate-500">Taille</th>
                <th className="px-4 py-3 font-medium text-slate-500">Déposé par</th>
                <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                <th className="px-4 py-3 font-medium text-slate-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-lg">{fileIcon(doc.mimetype)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy truncate max-w-xs">{doc.nom}</div>
                    {doc.description && (
                      <div className="text-xs text-slate-400 truncate max-w-xs">{doc.description}</div>
                    )}
                    {doc.latitude != null && doc.longitude != null && (
                      <a
                        href={`https://www.google.com/maps?q=${doc.latitude},${doc.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-dark hover:underline inline-flex items-center gap-0.5 mt-0.5"
                        title="Voir la position sur la carte"
                      >
                        📍 {doc.latitude.toFixed(5)}, {doc.longitude.toFixed(5)}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAT_BADGE[doc.categorie]}`}>
                      {DOC_CATEGORIE_LABELS[doc.categorie]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatSize(doc.taille)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{doc.user.name}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="text-xs text-cyan-dark hover:underline"
                        title="Télécharger"
                      >
                        Télécharger
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => {
                            if (confirm(`Supprimer "${doc.nom}" ?`)) {
                              removeMut.mutate(doc.id);
                            }
                          }}
                          className="text-xs text-red hover:underline"
                          title="Supprimer"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload dialog */}
      {showUpload && (
        <UploadDialog
          siteId={siteId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: ['documents', siteId] });
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

interface UploadDialogProps {
  siteId: string;
  onClose: () => void;
  onUploaded: () => void;
}

/** Capture la position GPS (best-effort, non bloquant). */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function UploadDialog({ siteId, onClose, onUploaded }: UploadDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [categorie, setCategorie] = useState<DocCategorie>('PHOTO');
  const [description, setDescription] = useState('');
  const [geoloc, setGeoloc] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Sélectionnez un fichier'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Fichier trop volumineux (max 15 Mo)'); return; }
    setError('');
    setBusy(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (geoloc) {
        const pos = await getPosition();
        if (pos) { latitude = pos.lat; longitude = pos.lng; }
      }
      // File d'attente hors-ligne (IndexedDB) → envoi immédiat si en ligne.
      await enqueuePhoto({
        siteId,
        nom: file.name,
        mimetype: file.type || 'application/octet-stream',
        categorie,
        description: description.trim() || undefined,
        latitude,
        longitude,
        blob: file,
      });
      await syncPhotos();
      onUploaded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-navy text-lg">Ajouter un document / photo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fichier / photo</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-navy file:text-white hover:file:bg-navy/90 cursor-pointer"
            />
            <p className="text-xs text-slate-400 mt-1">Max 15 Mo — sur mobile, ouvrez l'appareil photo</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as DocCategorie)}
              className="input w-full"
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{DOC_CATEGORIE_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description (optionnel)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Courte description…"
              className="input w-full"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={geoloc}
              onChange={(e) => setGeoloc(e.target.checked)}
              className="w-4 h-4 accent-cyan"
            />
            📍 Géolocaliser (position GPS de la prise de vue)
          </label>

          <p className="text-xs text-slate-400">
            Fonctionne hors-ligne : la photo est mise en file d'attente et
            synchronisée automatiquement au retour du réseau.
          </p>

          {error && <p className="text-sm text-red">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="btn-primary text-sm">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

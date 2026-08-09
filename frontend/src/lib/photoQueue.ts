import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { documentsApi } from '@/api/endpoints';

// ── File d'attente de photos géolocalisées (cf. mémoire XVI.4.1) ──────
// Les photos terrain (binaire + coordonnées GPS) ne peuvent pas tenir dans
// la file localStorage des mutations : on les stocke dans IndexedDB, puis on
// les téléverse au retour du réseau (ou immédiatement si en ligne).

const DB_NAME = 'cnn-btp-photos';
const STORE = 'pending';
const DB_VERSION = 1;

export interface PendingPhoto {
  id: string;
  siteId: string;
  nom: string;
  mimetype: string;
  categorie: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

// ── Compteur réactif (pour l'indicateur) ──────────────────────────────
let currentCount = 0;
const listeners = new Set<(n: number) => void>();

function notify(n: number) {
  currentCount = n;
  listeners.forEach((l) => l(n));
}

export function subscribePhotoCount(listener: (n: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhotoCount(): number {
  return currentCount;
}

async function refreshCount(): Promise<number> {
  const n = await tx<number>('readonly', (s) => s.count());
  notify(n);
  return n;
}

// ── API publique ──────────────────────────────────────────────────────
export async function enqueuePhoto(
  p: Omit<PendingPhoto, 'id' | 'createdAt'>,
): Promise<PendingPhoto> {
  const rec: PendingPhoto = {
    ...p,
    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await tx('readwrite', (s) => s.add(rec));
  await refreshCount();
  return rec;
}

async function listPhotos(): Promise<PendingPhoto[]> {
  return tx<PendingPhoto[]>('readonly', (s) => s.getAll() as IDBRequest<PendingPhoto[]>);
}

async function removePhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  await refreshCount();
}

let syncing = false;

/** Téléverse toutes les photos en attente. S'arrête au premier échec réseau. */
export async function syncPhotos(onUploaded?: (siteId: string) => void): Promise<void> {
  if (syncing || !onlineManager.isOnline()) return;
  syncing = true;
  try {
    const pending = await listPhotos();
    for (const ph of pending.sort((a, b) => a.createdAt - b.createdAt)) {
      const fd = new FormData();
      fd.append('file', new File([ph.blob], ph.nom, { type: ph.mimetype }));
      fd.append('categorie', ph.categorie);
      if (ph.description) fd.append('description', ph.description);
      if (ph.latitude != null) fd.append('latitude', String(ph.latitude));
      if (ph.longitude != null) fd.append('longitude', String(ph.longitude));
      try {
        await documentsApi.upload(ph.siteId, fd);
        await removePhoto(ph.id);
        onUploaded?.(ph.siteId);
      } catch {
        // Réseau perdu ou erreur serveur : on garde la photo pour un prochain essai.
        break;
      }
    }
  } finally {
    syncing = false;
  }
}

/** À appeler au démarrage : initialise le compteur et resynchronise au retour du réseau. */
export function initPhotoSync(qc: QueryClient): void {
  void refreshCount();
  const trigger = () =>
    void syncPhotos((siteId) => {
      void qc.invalidateQueries({ queryKey: ['documents', siteId] });
    });
  onlineManager.subscribe((online) => {
    if (online) trigger();
  });
  trigger(); // tentative initiale si déjà en ligne
}

import { useEffect, useState } from 'react';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { getPhotoCount, subscribePhotoCount } from '@/lib/photoQueue';

// Bandeau discret : état réseau + nombre de saisies terrain en attente de
// synchronisation — pointages, avancements et photos (cf. mémoire XVI.4.1).
// Masqué quand tout est synchronisé.
export function OfflineIndicator() {
  const [online, setOnline] = useState(() => onlineManager.isOnline());
  const [photos, setPhotos] = useState(() => getPhotoCount());

  useEffect(() => onlineManager.subscribe(setOnline), []);
  useEffect(() => subscribePhotoCount(setPhotos), []);

  // Mutations mises en file d'attente hors-ligne (pointage, avancement).
  const paused = useMutationState({
    filters: { predicate: (m) => m.state.isPaused },
  }).length;

  // Synchronisation en cours : de retour en ligne, mutations non-terminées.
  const running = useMutationState({
    filters: { predicate: (m) => !m.state.isPaused && m.state.status === 'pending' },
  }).length;

  const queued = paused + photos;

  if (online && queued === 0 && running === 0) return null;

  const offline = !online;
  const bg = offline ? 'bg-orange text-white' : 'bg-cyan text-white';
  const total = queued + running;
  const label = offline
    ? queued > 0
      ? `Hors-ligne — ${queued} saisie${queued > 1 ? 's' : ''} en attente`
      : 'Hors-ligne — les saisies seront synchronisées au retour du réseau'
    : `Synchronisation… ${total} élément${total > 1 ? 's' : ''}`;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium shadow-lg ${bg}`}
        role="status"
        aria-live="polite"
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            offline ? 'bg-white' : 'bg-white animate-pulse'
          }`}
        />
        {label}
      </div>
    </div>
  );
}

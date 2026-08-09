import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { registerOfflineMutationDefaults } from './lib/offline';
import { initPhotoSync } from './lib/photoQueue';
import './index.css';

const WEEK = 1000 * 60 * 60 * 24 * 7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      gcTime: WEEK, // conserver en cache pour consultation hors-ligne
    },
  },
});

// Mutations de saisie terrain résumables (pointage, avancement) — lib/offline.ts
registerOfflineMutationDefaults(queryClient);

// File d'attente des photos géolocalisées (IndexedDB) — lib/photoQueue.ts
initPhotoSync(queryClient);

// Persistance localStorage : survit à la fermeture de l'app / au hors-ligne.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'cnn-btp-offline-cache',
  throttleTime: 1000,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK,
        dehydrateOptions: {
          // Sécurité (cf. mémoire XVI.8) : ne persister QUE les données de
          // saisie terrain, jamais les données de paie / financières.
          shouldDehydrateQuery: (q) => {
            const root = q.queryKey[0];
            return (
              root === 'effectif-pointages' ||
              root === 'effectif-ouvriers' ||
              root === 'planning'
            );
          },
          // Conserver les pointages saisis hors-ligne, en attente de synchro.
          shouldDehydrateMutation: (m) =>
            m.state.isPaused || m.state.status === 'pending',
        },
      }}
      onSuccess={() => {
        // Rejoue les saisies en file d'attente dès que le cache est restauré.
        void queryClient.resumePausedMutations();
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);

import { api } from './client';
import type {
  AppAlert,
  Avenant,
  ContratST,
  DocCategorie,
  Document,
  FinanceGlobal,
  Lot,
  LoginResponse,
  Meteo,
  Ouvrier,
  Pointage,
  QualificationOuvrier,
  RapportChantier,
  ResumeMensuel,
  Role,
  Site,
  SiteKpi,
  SiteMember,
  SiteStatus,
  Situation,
  SousTraitant,
  Task,
  TaskStatus,
  TravauxSupp,
  TSStatus,
  User,
} from './types';

export interface CreateSituationPayload {
  numero: number;
  periode: string;
  dateEmission: string;
  notes?: string;
}

export interface LotPayload {
  code?: string;
  name?: string;
  description?: string;
  weight?: number;
  position?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface TaskPayload {
  name?: string;
  description?: string;
  progressPct?: number;
  status?: TaskStatus;
  weight?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .patch('/auth/change-password', { currentPassword, newPassword })
      .then((r) => r.data),
};

export const usersApi = {
  list: (params?: { role?: string; isActive?: boolean }) =>
    api.get<User[]>('/users', { params }).then((r) => r.data),
  create: (payload: { username: string; name: string; email?: string; role?: string }) =>
    api
      .post<{ user: User; temporaryPassword: string }>('/users', payload)
      .then((r) => r.data),
  update: (id: string, payload: Partial<Pick<User, 'name' | 'email' | 'role' | 'isActive'>>) =>
    api.patch<User>(`/users/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) => api.delete<User>(`/users/${id}`).then((r) => r.data),
  resetPassword: (id: string) =>
    api.patch<{ temporaryPassword: string }>(`/users/${id}/reset-password`).then((r) => r.data),
};

export interface CreateSitePayload {
  reference: string;
  name: string;
  location?: string;
  marcheHt: number;
  tvaRate?: number;
  startDate: string;
  endDatePlanned?: string;
  description?: string;
}

export const sitesApi = {
  list: () => api.get<Site[]>('/sites').then((r) => r.data),
  create: (payload: CreateSitePayload) =>
    api.post<Site>('/sites', payload).then((r) => r.data),
  get: (id: string) =>
    api.get<Site & { members: SiteMember[] }>(`/sites/${id}`).then((r) => r.data),
  update: (
    id: string,
    payload: Partial<Pick<Site, 'tauxRg' | 'avanceForfaitaire' | 'tvaRate' | 'marcheHt'>>,
  ) => api.patch<Site>(`/sites/${id}`, payload).then((r) => r.data),
  kpi: (id: string) => api.get<SiteKpi>(`/sites/${id}/kpi`).then((r) => r.data),
  members: (id: string) =>
    api.get<SiteMember[]>(`/sites/${id}/members`).then((r) => r.data),
  addMember: (id: string, payload: { userId: string; role: Role }) =>
    api.post<SiteMember>(`/sites/${id}/members`, payload).then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/sites/${id}/members/${userId}`).then((r) => r.data),
  changeStatus: (id: string, status: SiteStatus) =>
    api.patch<Site>(`/sites/${id}`, { status }).then((r) => r.data),
};

export const financeApi = {
  listSituations: (siteId: string) =>
    api.get<Situation[]>(`/sites/${siteId}/finance/situations`).then((r) => r.data),
  getSituation: (siteId: string, id: string) =>
    api.get<Situation>(`/sites/${siteId}/finance/situations/${id}`).then((r) => r.data),
  createSituation: (siteId: string, payload: CreateSituationPayload) =>
    api.post<Situation>(`/sites/${siteId}/finance/situations`, payload).then((r) => r.data),
  updateSituation: (siteId: string, id: string, payload: { status?: string; notes?: string; deductionAvance?: number }) =>
    api.patch<Situation>(`/sites/${siteId}/finance/situations/${id}`, payload).then((r) => r.data),
  deleteSituation: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/finance/situations/${id}`).then((r) => r.data),
  updateLigne: (
    siteId: string,
    situationId: string,
    ligneId: string,
    payload: { avancementCumul?: number; notes?: string },
  ) =>
    api
      .patch<Situation>(
        `/sites/${siteId}/finance/situations/${situationId}/lignes/${ligneId}`,
        payload,
      )
      .then((r) => r.data),
  updateLotBudget: (siteId: string, lotId: string, montantMarcheHt: number) =>
    api
      .patch(`/sites/${siteId}/finance/lots/${lotId}/budget`, { montantMarcheHt })
      .then((r) => r.data),
};

export const planningApi = {
  listLots: (siteId: string) =>
    api.get<Lot[]>(`/sites/${siteId}/lots`).then((r) => r.data),
  createLot: (siteId: string, payload: LotPayload) =>
    api.post<Lot>(`/sites/${siteId}/lots`, payload).then((r) => r.data),
  updateLot: (siteId: string, lotId: string, payload: LotPayload) =>
    api.patch<Lot>(`/sites/${siteId}/lots/${lotId}`, payload).then((r) => r.data),
  deleteLot: (siteId: string, lotId: string) =>
    api.delete(`/sites/${siteId}/lots/${lotId}`).then((r) => r.data),
  createTask: (siteId: string, lotId: string, payload: TaskPayload) =>
    api
      .post<Task>(`/sites/${siteId}/lots/${lotId}/tasks`, payload)
      .then((r) => r.data),
  updateTask: (siteId: string, lotId: string, taskId: string, payload: TaskPayload) =>
    api
      .patch<Task>(`/sites/${siteId}/lots/${lotId}/tasks/${taskId}`, payload)
      .then((r) => r.data),
  deleteTask: (siteId: string, lotId: string, taskId: string) =>
    api.delete(`/sites/${siteId}/lots/${lotId}/tasks/${taskId}`).then((r) => r.data),
  exportMspProject: (siteId: string) =>
    api
      .get(`/sites/${siteId}/planning/export.xml`, { responseType: 'blob' })
      .then((r) => r.data as Blob),
};

export interface CreateSousTraitantPayload { nom: string; contact?: string }
export interface CreateContratSTPayload {
  sousTraitantId: string;
  lotId?: string;
  reference: string;
  intitule: string;
  montantHt: number;
  tvaRate?: number;
  tauxRg?: number;
  avanceForfaitaire?: number;
  startDate?: string;
  endDate?: string;
}
export interface UpdateContratSTPayload {
  lotId?: string | null;
  reference?: string;
  intitule?: string;
  montantHt?: number;
  tvaRate?: number;
  tauxRg?: number;
  avanceForfaitaire?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
}
export interface CreateSituationSTPayload {
  numero: number;
  periode: string;
  dateEmission: string;
  montantHtPeriode?: number;
  notes?: string;
}
export interface UpdateSituationSTPayload {
  montantHtPeriode?: number;
  deductionAvance?: number;
  status?: string;
  notes?: string;
}

export const sousTraitanceApi = {
  list: (siteId: string) =>
    api.get<SousTraitant[]>(`/sites/${siteId}/sous-traitance/sous-traitants`).then((r) => r.data),
  createST: (siteId: string, payload: CreateSousTraitantPayload) =>
    api.post<SousTraitant>(`/sites/${siteId}/sous-traitance/sous-traitants`, payload).then((r) => r.data),
  updateST: (siteId: string, id: string, payload: Partial<CreateSousTraitantPayload>) =>
    api.patch<SousTraitant>(`/sites/${siteId}/sous-traitance/sous-traitants/${id}`, payload).then((r) => r.data),
  deleteST: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/sous-traitance/sous-traitants/${id}`).then((r) => r.data),
  createContrat: (siteId: string, payload: CreateContratSTPayload) =>
    api.post<ContratST>(`/sites/${siteId}/sous-traitance/contrats`, payload).then((r) => r.data),
  updateContrat: (siteId: string, contratId: string, payload: UpdateContratSTPayload) =>
    api.patch<ContratST>(`/sites/${siteId}/sous-traitance/contrats/${contratId}`, payload).then((r) => r.data),
  deleteContrat: (siteId: string, contratId: string) =>
    api.delete(`/sites/${siteId}/sous-traitance/contrats/${contratId}`).then((r) => r.data),
  createSituationST: (siteId: string, contratId: string, payload: CreateSituationSTPayload) =>
    api.post<ContratST>(`/sites/${siteId}/sous-traitance/contrats/${contratId}/situations`, payload).then((r) => r.data),
  updateSituationST: (siteId: string, contratId: string, situationId: string, payload: UpdateSituationSTPayload) =>
    api.patch<ContratST>(`/sites/${siteId}/sous-traitance/contrats/${contratId}/situations/${situationId}`, payload).then((r) => r.data),
  deleteSituationST: (siteId: string, contratId: string, situationId: string) =>
    api.delete(`/sites/${siteId}/sous-traitance/contrats/${contratId}/situations/${situationId}`).then((r) => r.data),
};

export const dashboardApi = {
  financeGlobal: () => api.get<FinanceGlobal>('/dashboard/finance').then((r) => r.data),
  alerts: () => api.get<AppAlert[]>('/dashboard/alerts').then((r) => r.data),
  planningGlobal: () =>
    api.get<import('./types').GlobalPlanningSite[]>('/dashboard/planning').then((r) => r.data),
};

export interface CreateTsPayload {
  reference: string;
  description: string;
  montantHt: number;
  tvaRate?: number;
  lotId?: string;
  dateNotif?: string;
  notes?: string;
}

export interface UpdateTsPayload {
  reference?: string;
  description?: string;
  montantHt?: number;
  tvaRate?: number;
  lotId?: string | null;
  status?: TSStatus;
  dateNotif?: string;
  notes?: string;
}

export const travauxSuppApi = {
  list: (siteId: string) =>
    api.get<TravauxSupp[]>(`/sites/${siteId}/travaux-supp`).then((r) => r.data),
  create: (siteId: string, payload: CreateTsPayload) =>
    api.post<TravauxSupp>(`/sites/${siteId}/travaux-supp`, payload).then((r) => r.data),
  update: (siteId: string, id: string, payload: UpdateTsPayload) =>
    api.patch<TravauxSupp>(`/sites/${siteId}/travaux-supp/${id}`, payload).then((r) => r.data),
  remove: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/travaux-supp/${id}`).then((r) => r.data),
};

export interface CreateRapportPayload {
  date: string;
  meteo?: Meteo;
  effectif?: number;
  travauxRealises?: string;
  materiaux?: string;
  observations?: string;
  incidents?: string;
}

export const rapportsApi = {
  list: (siteId: string) =>
    api.get<RapportChantier[]>(`/sites/${siteId}/rapports`).then((r) => r.data),
  upsert: (siteId: string, payload: CreateRapportPayload) =>
    api.post<RapportChantier>(`/sites/${siteId}/rapports`, payload).then((r) => r.data),
  update: (siteId: string, id: string, payload: Partial<CreateRapportPayload>) =>
    api.patch<RapportChantier>(`/sites/${siteId}/rapports/${id}`, payload).then((r) => r.data),
  remove: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/rapports/${id}`).then((r) => r.data),
};

export interface CreateAvenantPayload {
  numero: number;
  objet: string;
  montantHt: number;
  dateNotif: string;
  dateApprobation?: string;
  notes?: string;
}

export const avenantsApi = {
  list: (siteId: string) =>
    api.get<Avenant[]>(`/sites/${siteId}/finance/avenants`).then((r) => r.data),
  create: (siteId: string, payload: CreateAvenantPayload) =>
    api.post<Avenant>(`/sites/${siteId}/finance/avenants`, payload).then((r) => r.data),
  update: (siteId: string, id: string, payload: Partial<CreateAvenantPayload>) =>
    api.patch<Avenant>(`/sites/${siteId}/finance/avenants/${id}`, payload).then((r) => r.data),
  remove: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/finance/avenants/${id}`).then((r) => r.data),
};

export interface CreateOuvrierPayload {
  nom: string;
  prenom?: string;
  fonction?: string;
  qualification?: QualificationOuvrier;
  tauxJournalier: number;
  dateEntree: string;
  dateSortie?: string;
  telephone?: string;
  notes?: string;
}

export const effectifApi = {
  listOuvriers: (siteId: string, actifOnly = false) =>
    api.get<Ouvrier[]>(`/sites/${siteId}/effectif/ouvriers`, {
      params: actifOnly ? { actif: 'true' } : {},
    }).then((r) => r.data),
  createOuvrier: (siteId: string, payload: CreateOuvrierPayload) =>
    api.post<Ouvrier>(`/sites/${siteId}/effectif/ouvriers`, payload).then((r) => r.data),
  updateOuvrier: (siteId: string, id: string, payload: Partial<CreateOuvrierPayload> & { actif?: boolean }) =>
    api.patch<Ouvrier>(`/sites/${siteId}/effectif/ouvriers/${id}`, payload).then((r) => r.data),
  removeOuvrier: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/effectif/ouvriers/${id}`).then((r) => r.data),
  listPointages: (siteId: string, mois: string) =>
    api.get<Pointage[]>(`/sites/${siteId}/effectif/pointages`, { params: { mois } }).then((r) => r.data),
  upsertPointage: (siteId: string, payload: { ouvrierId: string; date: string; present?: boolean; heures?: number; notes?: string }) =>
    api.post<Pointage>(`/sites/${siteId}/effectif/pointages`, payload).then((r) => r.data),
  deletePointage: (siteId: string, id: string) =>
    api.delete(`/sites/${siteId}/effectif/pointages/${id}`).then((r) => r.data),
  resume: (siteId: string, mois: string) =>
    api.get<ResumeMensuel>(`/sites/${siteId}/effectif/resume`, { params: { mois } }).then((r) => r.data),
};

export const documentsApi = {
  list: (siteId: string, categorie?: DocCategorie) =>
    api
      .get<Document[]>(`/sites/${siteId}/documents`, { params: categorie ? { categorie } : undefined })
      .then((r) => r.data),
  upload: (siteId: string, formData: FormData) =>
    api.post<Document>(`/sites/${siteId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data),
  download: async (siteId: string, docId: string, nom: string) => {
    const res = await api.get(`/sites/${siteId}/documents/${docId}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data as Blob);
    const a = globalThis.document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
  },
  remove: (siteId: string, docId: string) =>
    api.delete(`/sites/${siteId}/documents/${docId}`).then((r) => r.data),
};

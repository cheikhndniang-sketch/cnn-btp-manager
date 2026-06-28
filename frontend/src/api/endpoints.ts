import { api } from './client';
import type {
  Lot,
  LoginResponse,
  Site,
  SiteKpi,
  SiteMember,
  Task,
  TaskStatus,
  User,
} from './types';

export interface LotPayload {
  code?: string;
  name?: string;
  description?: string;
  weight?: number;
  position?: number;
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
};

export const sitesApi = {
  list: () => api.get<Site[]>('/sites').then((r) => r.data),
  get: (id: string) =>
    api.get<Site & { members: SiteMember[] }>(`/sites/${id}`).then((r) => r.data),
  kpi: (id: string) => api.get<SiteKpi>(`/sites/${id}/kpi`).then((r) => r.data),
  members: (id: string) =>
    api.get<SiteMember[]>(`/sites/${id}/members`).then((r) => r.data),
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
};

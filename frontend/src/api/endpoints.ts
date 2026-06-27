import { api } from './client';
import type {
  LoginResponse,
  Site,
  SiteKpi,
  SiteMember,
  User,
} from './types';

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

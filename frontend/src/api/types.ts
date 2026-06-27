export type Role =
  | 'ADMIN'
  | 'DIRECTEUR_PROJET'
  | 'DIRECTEUR_TRAVAUX'
  | 'CONDUCTEUR_TRAVAUX';

export type SiteStatus = 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';

export interface User {
  id: string;
  username: string;
  email: string | null;
  name: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface Site {
  id: string;
  reference: string;
  name: string;
  location: string | null;
  marcheHt: number;
  tvaRate: number;
  startDate: string;
  endDatePlanned: string | null;
  status: SiteStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteMember {
  userId: string;
  username: string;
  name: string;
  role: Role;
  joinedAt: string;
}

export interface SiteKpi {
  avancementPct: number;
  budgetTotal: number;
  joursRestants: number;
  membresCount: number;
  alertesCount: number;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  DIRECTEUR_PROJET: 'Directeur de projet',
  DIRECTEUR_TRAVAUX: 'Directeur de travaux',
  CONDUCTEUR_TRAVAUX: 'Conducteur de travaux',
};

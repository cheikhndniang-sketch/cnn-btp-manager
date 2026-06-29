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
  avancementPct: number;
  avancementPlanifie: number;
  tasksLate: number;
  tasksTotal: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export interface Task {
  id: string;
  lotId: string;
  name: string;
  description: string | null;
  progressPct: number;
  plannedPct: number;
  enRetard: boolean;
  retardJours: number;
  aDemarrer: boolean;
  status: TaskStatus;
  weight: number;
  position: number;
  startDate: string | null;
  endDate: string | null;
}

export interface Lot {
  id: string;
  siteId: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  position: number;
  montantMarcheHt: number;
  progressPct: number;
  plannedPct: number;
  tasksLate: number;
  tasksToStart: number;
  retardJoursMax: number;
  startDate: string | null;
  endDate: string | null;
  tasks: Task[];
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminé',
  BLOCKED: 'Bloqué',
};

export interface SiteMember {
  userId: string;
  username: string;
  name: string;
  role: Role;
  joinedAt: string;
}

export interface SiteKpi {
  avancementPct: number;
  avancementPlanifie: number;
  ecartPct: number;
  tasksLate: number;
  tasksTotal: number;
  retardMaxJours: number;
  budgetTotal: number;
  joursRestants: number;
  membresCount: number;
  alertesCount: number;
}

export type SituationStatus = 'BROUILLON' | 'VALIDEE' | 'PAYEE';

export interface SituationLigne {
  id: string;
  lotId: string;
  lotCode: string;
  lotName: string;
  montantMarcheHt: number;
  avancementCumul: number;
  montantHtCumul: number;
  notes: string | null;
}

export interface Situation {
  id: string;
  siteId: string;
  numero: number;
  periode: string;
  dateEmission: string;
  status: SituationStatus;
  notes: string | null;
  lignes: SituationLigne[];
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  tvaRate: number;
  createdAt: string;
  updatedAt: string;
}

export const SITUATION_STATUS_LABELS: Record<SituationStatus, string> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  PAYEE: 'Payée',
};

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

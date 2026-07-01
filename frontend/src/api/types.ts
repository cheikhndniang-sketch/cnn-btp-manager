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
  tauxRg: number;
  avanceForfaitaire: number;
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
  tauxRg: number;
  montantRg: number;
  deductionAvance: number;
  avanceForfaitaire: number;
  netAPayer: number;
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

// ── Sous-traitance ────────────────────────────────────────────────────

export type ContratSTStatus = 'ACTIF' | 'TERMINE' | 'RESILIE';
export type SituationSTStatus = 'BROUILLON' | 'VALIDEE' | 'PAYEE';

export const CONTRAT_ST_STATUS_LABELS: Record<ContratSTStatus, string> = {
  ACTIF: 'Actif',
  TERMINE: 'Terminé',
  RESILIE: 'Résilié',
};

export const SITUATION_ST_STATUS_LABELS: Record<SituationSTStatus, string> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  PAYEE: 'Payée',
};

export interface SituationST {
  id: string;
  contratId: string;
  siteId: string;
  numero: number;
  periode: string;
  dateEmission: string;
  status: SituationSTStatus;
  notes: string | null;
  montantHtPeriode: number;
  rgHt: number;
  deductionAvance: number;
  totalHtva: number;
  tvaAmount: number;
  totalTtc: number;
  netAPayer: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContratST {
  id: string;
  siteId: string;
  sousTraitantId: string;
  lotId: string | null;
  lotCode: string | null;
  lotName: string | null;
  reference: string;
  intitule: string;
  montantHt: number;
  tvaRate: number;
  tauxRg: number;
  avanceForfaitaire: number;
  avanceRestante: number;
  status: ContratSTStatus;
  startDate: string | null;
  endDate: string | null;
  montantHtCumul: number;
  pctAvancement: number;
  totalRgRetenu: number;
  totalPaye: number;
  totalARecouvrer: number;
  situations: SituationST[];
  createdAt: string;
  updatedAt: string;
}

export interface SousTraitant {
  id: string;
  siteId: string;
  nom: string;
  contact: string | null;
  contrats: ContratST[];
  createdAt: string;
  updatedAt: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  DIRECTEUR_PROJET: 'Directeur de projet',
  DIRECTEUR_TRAVAUX: 'Directeur de travaux',
  CONDUCTEUR_TRAVAUX: 'Conducteur de travaux',
};

// ── Dashboard financier global ────────────────────────────────────────

export interface SiteFinanceRow {
  siteId: string;
  siteName: string;
  siteReference: string;
  siteStatus: SiteStatus;
  marcheHt: number;
  tvaRate: number;
  tauxRg: number;
  htCumul: number;
  pctAvancement: number;
  montantRg: number;
  netAPayer: number;
  totalTtc: number;
  lastSituationNumero: number | null;
  lastSituationPeriode: string | null;
  lastSituationStatus: string | null;
  situationsBrouillon: number;
  tsApprouveHt: number;
}

export interface FinanceGlobal {
  totalBudgetHt: number;
  totalHtCumul: number;
  pctEngagement: number;
  totalRgRetenu: number;
  totalNetEnAttente: number;
  totalTsApprouveHt: number;
  totalSituationsBrouillon: number;
  parSite: SiteFinanceRow[];
}

// ── Travaux supplémentaires ───────────────────────────────────────────

export type TSStatus = 'BROUILLON' | 'VALIDE' | 'FACTURE' | 'PAYE';

export const TS_STATUS_LABELS: Record<TSStatus, string> = {
  BROUILLON: 'Brouillon',
  VALIDE: 'Validé',
  FACTURE: 'Facturé',
  PAYE: 'Payé',
};

export interface TravauxSupp {
  id: string;
  siteId: string;
  lotId: string | null;
  lotCode: string | null;
  lotName: string | null;
  reference: string;
  description: string;
  montantHt: number;
  tvaRate: number;
  montantTva: number;
  montantTtc: number;
  status: TSStatus;
  dateNotif: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Alertes ───────────────────────────────────────────────────────────

export type AlertType = 'TASKS_LATE' | 'SITUATION_BROUILLON' | 'TS_BROUILLON';
export type AlertSeverity = 'WARNING' | 'INFO';

export interface AppAlert {
  type: AlertType;
  severity: AlertSeverity;
  siteId: string;
  siteName: string;
  siteReference: string;
  count: number;
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  TASKS_LATE: 'Tâches en retard',
  SITUATION_BROUILLON: 'Situation brouillon',
  TS_BROUILLON: 'Travaux suppl. à valider',
};

// ── Journal de chantier ───────────────────────────────────────────────

export type Meteo = 'SOLEIL' | 'NUAGEUX' | 'PLUIE' | 'ORAGE';

export const METEO_LABELS: Record<Meteo, string> = {
  SOLEIL: '☀️ Soleil',
  NUAGEUX: '⛅ Nuageux',
  PLUIE: '🌧️ Pluie',
  ORAGE: '⛈️ Orage',
};

export interface RapportChantier {
  id: string;
  siteId: string;
  date: string;
  meteo: Meteo | null;
  effectif: number;
  travauxRealises: string | null;
  materiaux: string | null;
  observations: string | null;
  incidents: string | null;
  redacteurId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Avenants ──────────────────────────────────────────────────────────

export interface Avenant {
  id: string;
  siteId: string;
  numero: number;
  objet: string;
  montantHt: number;
  dateNotif: string;
  dateApprobation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Planning global ───────────────────────────────────────────────────

export interface GlobalTask {
  id: string;
  name: string;
  status: TaskStatus;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  enRetard: boolean;
}

export interface GlobalLot {
  id: string;
  code: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  tasks: GlobalTask[];
}

export interface GlobalPlanningSite {
  siteId: string;
  siteName: string;
  siteReference: string;
  lots: GlobalLot[];
}

// ── Documents ─────────────────────────────────────────────────────────

export type DocCategorie =
  | 'PV'
  | 'COMPTE_RENDU'
  | 'ATTACHEMENT'
  | 'FACTURE'
  | 'PLAN'
  | 'PHOTO'
  | 'CONTRAT'
  | 'COURRIER'
  | 'AUTRE';

export const DOC_CATEGORIE_LABELS: Record<DocCategorie, string> = {
  PV: 'PV',
  COMPTE_RENDU: 'Compte-rendu',
  ATTACHEMENT: 'Attachement',
  FACTURE: 'Facture',
  PLAN: 'Plan',
  PHOTO: 'Photo',
  CONTRAT: 'Contrat',
  COURRIER: 'Courrier',
  AUTRE: 'Autre',
};

export interface Document {
  id: string;
  siteId: string;
  uploadedBy: string;
  nom: string;
  categorie: DocCategorie;
  mimetype: string;
  taille: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string };
}

// ── Suivi effectif & salaires ─────────────────────────────────────────

export type QualificationOuvrier =
  | 'MANOEUVRE'
  | 'OUVRIER_SPECIALISE'
  | 'CHEF_EQUIPE'
  | 'TECHNICIEN'
  | 'AGENT_MAITRISE'
  | 'INGENIEUR'
  | 'AUTRE';

export const QUALIFICATION_LABELS: Record<QualificationOuvrier, string> = {
  MANOEUVRE: 'Manœuvre',
  OUVRIER_SPECIALISE: 'Ouvrier spécialisé',
  CHEF_EQUIPE: "Chef d'équipe",
  TECHNICIEN: 'Technicien',
  AGENT_MAITRISE: 'Agent de maîtrise',
  INGENIEUR: 'Ingénieur',
  AUTRE: 'Autre',
};

export interface Ouvrier {
  id: string;
  siteId: string;
  nom: string;
  prenom: string | null;
  fonction: string | null;
  qualification: QualificationOuvrier;
  tauxJournalier: number;
  dateEntree: string;
  dateSortie: string | null;
  actif: boolean;
  telephone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pointage {
  id: string;
  ouvrierId: string;
  siteId: string;
  date: string;
  present: boolean;
  heures: number;
  notes: string | null;
  createdAt: string;
  ouvrier: Pick<Ouvrier, 'id' | 'nom' | 'prenom' | 'fonction'>;
}

export interface LigneResume {
  ouvrierId: string;
  nom: string;
  prenom: string | null;
  fonction: string | null;
  qualification: QualificationOuvrier;
  tauxJournalier: number;
  joursPresents: number;
  heuresTotales: number;
  salaireHt: number;
}

export interface ResumeMensuel {
  mois: string;
  lignes: LigneResume[];
  totalJours: number;
  totalSalaire: number;
}

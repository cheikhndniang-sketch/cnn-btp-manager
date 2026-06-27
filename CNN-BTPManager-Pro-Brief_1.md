# CNN-BTPManager-Pro — Brief de démarrage Phase 1
## Pour Claude Code — Projet ERP BTP CSE Immobilier

---

## Contexte

Tu vas construire **CNN-BTPManager-Pro**, un ERP BTP complet pour **CSE Immobilier** (Dakar, Sénégal).

Le projet pilote est la **Reconstruction du Marché Sandaga** (~6 milliards FCFA, 4 lots, plusieurs corps de métier et sous-traitants).

L'objectif de cette Phase 1 est d'avoir une **application fonctionnelle en production** avec :
- Authentification sécurisée JWT
- Gestion des utilisateurs et des rôles
- Gestion des chantiers
- Tableau de bord avec KPI

---

## Stack technologique

| Couche | Technologie |
|--------|-------------|
| Backend API | NestJS 10 + TypeScript strict |
| Frontend | React 18 + TypeScript + Vite |
| CSS / UI | Tailwind CSS 3 + shadcn/ui |
| Base de données | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | JWT (access 15min) + refresh token (7j, cookie HttpOnly) + bcrypt |
| Déploiement | Docker Compose (dev) → Railway (prod) |
| Tests | Jest (backend) + Playwright (E2E) |

---

## Structure du monorepo

```
cnn-btp-manager/
├── backend/          # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   └── sites/
│   │   ├── common/
│   │   │   ├── guards/
│   │   │   ├── decorators/
│   │   │   └── filters/
│   │   └── main.ts
│   ├── prisma/
│   │   └── schema.prisma
│   └── test/
├── frontend/         # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api/
│   └── index.html
├── docker-compose.yml
└── .env.example
```

---

## Schéma Prisma — Phase 1 (tables requises)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  DIRECTEUR_PROJET
  DIRECTEUR_TRAVAUX
  CONDUCTEUR_TRAVAUX
}

enum SiteStatus {
  ACTIVE
  ARCHIVED
  COMPLETED
}

model User {
  id           String    @id @default(uuid())
  username     String    @unique
  passwordHash String
  email        String?   @unique
  name         String
  role         Role      @default(CONDUCTEUR_TRAVAUX)
  isActive     Boolean   @default(true)
  lastLogin    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  siteMembers  SiteMember[]
  auditLogs    AuditLog[]
  refreshTokens RefreshToken[]

  @@index([username])
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
}

model Site {
  id               String     @id @default(uuid())
  reference        String     @unique
  name             String
  location         String?
  marcheHt         BigInt
  tvaRate          Decimal    @default(0.18) @db.Decimal(5, 4)
  startDate        DateTime   @db.Date
  endDatePlanned   DateTime?  @db.Date
  status           SiteStatus @default(ACTIVE)
  description      String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  members  SiteMember[]

  @@index([status])
}

model SiteMember {
  id       String @id @default(uuid())
  siteId   String
  userId   String
  role     Role
  joinedAt DateTime @default(now())

  site Site @relation(fields: [siteId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([siteId, userId])
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?
  action     String
  entity     String
  entityId   String?
  details    Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([entity, entityId])
}
```

---

## Modules NestJS à implémenter

### 1. AuthModule

**Fichiers à créer :**
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/strategies/jwt.strategy.ts`
- `src/modules/auth/strategies/jwt-refresh.strategy.ts`
- `src/modules/auth/guards/jwt-auth.guard.ts`
- `src/modules/auth/guards/roles.guard.ts`
- `src/modules/auth/decorators/roles.decorator.ts`
- `src/modules/auth/dto/login.dto.ts`
- `src/modules/auth/dto/change-password.dto.ts`

**Endpoints :**
```
POST   /v1/auth/login            → { access_token, user }  + cookie refresh_token HttpOnly
POST   /v1/auth/refresh          → { access_token }        (lit cookie refresh_token)
POST   /v1/auth/logout           → {}                      (invalide le refresh token)
GET    /v1/auth/me               → User (sans passwordHash)
PATCH  /v1/auth/change-password  → {}
```

**Règles :**
- `access_token` expire en 15 minutes (JWT_EXPIRES_IN=15m)
- `refresh_token` expire en 7 jours, stocké en cookie HttpOnly Secure SameSite=Strict
- Mot de passe haché avec bcrypt (rounds=12)
- Bloquer après 10 tentatives échouées → 429 pendant 15 min (rate-limiting NestJS Throttler)
- Journaliser toutes les connexions dans AuditLog
- À la première connexion (firstLogin=true), forcer le changement de mot de passe

**DTOs avec validation :**
```typescript
// login.dto.ts
export class LoginDto {
  @IsString() @MinLength(3) username: string;
  @IsString() @MinLength(8) password: string;
}
```

---

### 2. UsersModule

**Endpoints :**
```
GET    /v1/users            → Liste (admin only) — filtres: role, isActive
POST   /v1/users            → Création (admin only)
GET    /v1/users/:id        → Détail
PATCH  /v1/users/:id        → Modification
DELETE /v1/users/:id        → Désactivation (isActive=false) — jamais suppression physique
GET    /v1/users/:id/sites  → Chantiers assignés à l'utilisateur
```

**Règles :**
- Un admin ne peut pas se désactiver lui-même
- Le username est unique, insensible à la casse (toLowerCase avant stockage)
- Mot de passe initial généré aléatoirement et retourné une seule fois
- PATCH sur role ou isActive : admin uniquement

---

### 3. SitesModule

**Endpoints :**
```
GET    /v1/sites                       → Liste (selon rôle : tous pour admin/DP, assignés pour DT/CT)
POST   /v1/sites                       → Création (admin, directeur_projet)
GET    /v1/sites/:id                   → Détail (avec membres)
PATCH  /v1/sites/:id                   → Modification
DELETE /v1/sites/:id                   → Archivage (status=ARCHIVED)
GET    /v1/sites/:id/members           → Membres du chantier
POST   /v1/sites/:id/members           → Ajout d'un membre
DELETE /v1/sites/:id/members/:userId   → Retrait d'un membre
GET    /v1/sites/:id/kpi               → KPI synthétiques
```

**KPI retournés (Phase 1, valeurs statiques en attendant Phase 2) :**
```json
{
  "avancementPct": 0,
  "budgetTotal": 6000000000,
  "joursRestants": 180,
  "membresCount": 3,
  "alertesCount": 0
}
```

---

## Guards et sécurité

```typescript
// common/guards/roles.guard.ts
// Utiliser le décorateur @Roles() sur chaque endpoint
// Vérifier req.user.role contre les rôles requis

// Hiérarchie des rôles :
// ADMIN > DIRECTEUR_PROJET > DIRECTEUR_TRAVAUX > CONDUCTEUR_TRAVAUX

// Exemple d'usage :
@Get()
@Roles('ADMIN', 'DIRECTEUR_PROJET')
@UseGuards(JwtAuthGuard, RolesGuard)
findAll() { ... }
```

**Isolation des données :**
- Toutes les requêtes sur /sites filtrent automatiquement selon `req.user` :
  - ADMIN / DIRECTEUR_PROJET → tous les sites
  - DIRECTEUR_TRAVAUX / CONDUCTEUR_TRAVAUX → uniquement leurs `SiteMember.siteId`

---

## Frontend React — Pages Phase 1

### Page de connexion (`/login`)
```
- Formulaire centré avec logo CSE Immobilier (placeholder SVG bleu)
- Champs : username + password
- Validation temps réel (react-hook-form + zod)
- Message d'erreur générique en cas d'échec
- Charte graphique : fond #003366, bouton #00AEEF
```

### Tableau de bord (`/dashboard`)
```
- Header fixe : logo + nom utilisateur + déconnexion
- Sidebar gauche : navigation (Chantiers, Planning, Finance, ST, Docs)
- Grille KPI : 4 cartes (Total chantiers, Alertes, Production mois, Avancement moyen)
- Liste des chantiers avec barre de progression
- Responsive 1024px+
```

### Vue chantier (`/sites/:id`)
```
- En-tête : nom du chantier + référence + KPI synthétiques
- Onglets : Planning | Rapports | Finance | Sous-traitance | Documents
- Phase 1 : seul l'onglet "Vue générale" est actif, les autres affichent "Disponible en Phase 2"
```

### Gestion utilisateurs (`/admin/users`) — Admin uniquement
```
- Tableau des utilisateurs avec filtres
- Bouton "Nouvel utilisateur" → modal de création
- Actions par ligne : modifier rôle, activer/désactiver
```

---

## Charte graphique CSS

```css
/* tailwind.config.js — couleurs CSE Immobilier */
colors: {
  cyan:  { DEFAULT: '#00AEEF', dark: '#009FD9' },
  navy:  { DEFAULT: '#003366', dark: '#002244', light: '#1A4A7A' },
  green: { DEFAULT: '#1E7A3C', light: '#D4EDDA' },
  orange:{ DEFAULT: '#F0A500', light: '#FFF3CD' },
  red:   { DEFAULT: '#A32D2D', light: '#FCE8E8' },
  surface: { 0: '#F4F3EE', 1: '#FAFAF7', 2: '#FFFFFF' },
}

/* Composants de base */
.btn-primary   { @apply bg-cyan text-white rounded-lg px-4 py-2 font-medium hover:bg-cyan-dark }
.btn-secondary { @apply border border-navy text-navy rounded-lg px-4 py-2 hover:bg-surface-1 }
.card          { @apply bg-white border border-slate-200 rounded-xl p-4 shadow-sm }
.kpi-card      { @apply card flex flex-col gap-1 }
.sidebar       { @apply bg-navy text-white w-60 min-h-screen flex flex-col }
```

---

## Variables d'environnement

### backend/.env.local
```env
DATABASE_URL="postgresql://cnn:cnn_secret@localhost:5432/cnn_btp"
JWT_SECRET="dev-secret-change-in-production-minimum-256-bits"
JWT_REFRESH_SECRET="dev-refresh-secret-different-from-jwt-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
BCRYPT_ROUNDS=12
THROTTLE_TTL=60
THROTTLE_LIMIT=100
NODE_ENV="development"
PORT=3000
FRONTEND_URL="http://localhost:5173"
```

### frontend/.env.local
```env
VITE_API_URL="http://localhost:3000/v1"
VITE_APP_NAME="CNN-BTPManager Pro"
```

---

## Docker Compose (développement)

```yaml
# docker-compose.yml
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: cnn_btp
      POSTGRES_USER: cnn
      POSTGRES_PASSWORD: cnn_secret
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cnn -d cnn_btp"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## Tests requis — Phase 1

### Backend (Jest)
```
auth.service.spec.ts
  ✓ login avec identifiants valides retourne access_token
  ✓ login avec mauvais mot de passe lève UnauthorizedException
  ✓ refresh token invalide lève UnauthorizedException
  ✓ mot de passe haché avec bcrypt (rounds=12)

users.service.spec.ts
  ✓ création utilisateur avec username unique
  ✓ création avec username existant lève ConflictException
  ✓ désactivation ne supprime pas l'utilisateur en base
  ✓ admin ne peut pas se désactiver lui-même

sites.service.spec.ts
  ✓ conducteur ne voit que ses chantiers assignés
  ✓ admin voit tous les chantiers
  ✓ création chantier avec référence unique
```

---

## Pipeline CI/CD GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_DB: cnn_btp_test, POSTGRES_USER: cnn, POSTGRES_PASSWORD: cnn_secret }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd backend && npm ci
      - run: cd backend && npx prisma migrate deploy
        env: { DATABASE_URL: postgresql://cnn:cnn_secret@localhost:5432/cnn_btp_test }
      - run: cd backend && npm run test:cov
      - run: cd backend && npm run build
      - run: cd frontend && npm ci && npm run build
```

---

## Données de test (seed)

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('Admin@2026!', 12);
  const userHash  = await bcrypt.hash('User@2026!', 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: adminHash, name: 'Administrateur CSE', role: 'ADMIN', email: 'admin@cseimmobilier.sn' },
  });

  const dp = await prisma.user.upsert({
    where: { username: 'directeur.projet' },
    update: {},
    create: { username: 'directeur.projet', passwordHash: userHash, name: 'Directeur de Projet', role: 'DIRECTEUR_PROJET' },
  });

  const dt = await prisma.user.upsert({
    where: { username: 'directeur.travaux' },
    update: {},
    create: { username: 'directeur.travaux', passwordHash: userHash, name: 'Directeur de Travaux', role: 'DIRECTEUR_TRAVAUX' },
  });

  const ct = await prisma.user.upsert({
    where: { username: 'cheikh.conducteur' },
    update: {},
    create: { username: 'cheikh.conducteur', passwordHash: userHash, name: 'Cheikh — Conducteur de travaux', role: 'CONDUCTEUR_TRAVAUX' },
  });

  const site = await prisma.site.upsert({
    where: { reference: 'SAN-2024-001' },
    update: {},
    create: {
      reference: 'SAN-2024-001',
      name: 'PROJET DE RECONSTRUCTION DU MARCHÉ SANDAGA',
      location: 'Plateau, Dakar, Sénégal',
      marcheHt: BigInt('6000000000'),
      tvaRate: 0.18,
      startDate: new Date('2024-01-15'),
      endDatePlanned: new Date('2026-12-31'),
      status: 'ACTIVE',
    },
  });

  // Affecter tous les utilisateurs au chantier Sandaga
  for (const [user, role] of [[dp, 'DIRECTEUR_PROJET'], [dt, 'DIRECTEUR_TRAVAUX'], [ct, 'CONDUCTEUR_TRAVAUX']]) {
    await prisma.siteMember.upsert({
      where: { siteId_userId: { siteId: site.id, userId: user.id } },
      update: {},
      create: { siteId: site.id, userId: user.id, role: role as any },
    });
  }

  console.log('✓ Seed terminé');
  console.log('  admin / Admin@2026!');
  console.log('  directeur.projet / User@2026!');
  console.log('  directeur.travaux / User@2026!');
  console.log('  cheikh.conducteur / User@2026!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

---

## Checklist de livraison — Phase 1

- [ ] `POST /v1/auth/login` retourne JWT + cookie refresh
- [ ] `POST /v1/auth/refresh` renouvelle le token
- [ ] `POST /v1/auth/logout` invalide le refresh token
- [ ] `GET /v1/auth/me` retourne le profil (sans passwordHash)
- [ ] CRUD complet `/v1/users` avec guards RBAC
- [ ] CRUD complet `/v1/sites` avec isolation des données par rôle
- [ ] Seed fonctionnel : 4 utilisateurs + 1 chantier Sandaga
- [ ] Page `/login` responsive avec charte CSE
- [ ] Page `/dashboard` avec KPI et liste des chantiers
- [ ] Page `/sites/:id` avec onglets (Phase 2 = placeholder)
- [ ] Page `/admin/users` accessible admin uniquement
- [ ] Tests Jest : couverture > 70%
- [ ] Docker Compose : `docker compose up` lance tout
- [ ] Variables d'environnement documentées dans `.env.example`
- [ ] README.md avec instructions de démarrage

---

## Commande de démarrage Claude Code

```bash
# Dans le terminal, à la racine du projet vide :
claude

# Puis colle ce prompt :
```

**Prompt à copier-coller dans Claude Code :**

```
Tu vas construire CNN-BTPManager-Pro Phase 1 — un ERP BTP NestJS + React + PostgreSQL pour CSE Immobilier (Dakar, Sénégal).

Lis d'abord le brief complet dans CNN-BTPManager-Pro-Brief.md, puis :

1. Crée le docker-compose.yml avec PostgreSQL
2. Initialise le projet NestJS (backend/) avec Prisma
3. Crée le schéma Prisma complet (schema.prisma) selon le brief
4. Implémente AuthModule (login/refresh/logout/me) avec JWT + bcrypt
5. Implémente UsersModule (CRUD + RBAC)
6. Implémente SitesModule (CRUD + isolation par rôle)
7. Initialise le frontend React + Vite + Tailwind
8. Crée les pages : /login, /dashboard, /sites/:id, /admin/users
9. Ajoute les tests Jest sur les services critiques
10. Crée le seed Prisma avec les 4 utilisateurs et le chantier Sandaga

Respecte strictement la charte graphique CSE : cyan #00AEEF, bleu marine #003366.
TypeScript strict mode. Validation class-validator sur tous les DTOs.
```

---

*Document généré par CNN-BTPManager-Pro — CSE Immobilier — Confidentiel*

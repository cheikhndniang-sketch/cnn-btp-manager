# CNN-BTPManager-Pro — Phase 1

ERP BTP pour **CSE Immobilier** (Dakar, Sénégal) — projet pilote : reconstruction du Marché Sandaga (~6 milliards FCFA).

Stack : **NestJS 10 + Prisma 5 + PostgreSQL 16** (backend) · **React 18 + Vite + Tailwind 3** (frontend).

---

## Démarrage rapide

### 1. Base de données (Docker)

```bash
docker compose up -d
```

PostgreSQL démarre sur **`localhost:5544`** (db `cnn_btp`, user `cnn`, mot de passe `cnn_secret`).

> **Note port :** le port hôte est `5544` (et non `5432`) pour éviter un conflit avec des
> installations PostgreSQL natives déjà présentes sur cette machine (5432/5433). Pour utiliser
> `5432`, modifiez le mapping `ports` dans `docker-compose.yml` et la valeur `DATABASE_URL` dans
> `backend/.env.local` et `backend/.env`.

### 2. Backend

```bash
cd backend
cp ../.env.example .env.local      # ajuster si besoin
npm install
npx prisma generate
npx prisma migrate dev --name init  # crée les tables
npm run prisma:seed                 # 4 utilisateurs + chantier Sandaga
npm run start:dev                   # API sur http://localhost:3000/v1
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

---

## Comptes de démonstration (seed)

| Identifiant         | Mot de passe   | Rôle                  |
|---------------------|----------------|-----------------------|
| `admin`             | `Admin@2026!`  | Administrateur        |
| `directeur.projet`  | `User@2026!`   | Directeur de projet   |
| `directeur.travaux` | `User@2026!`   | Directeur de travaux  |
| `cheikh.conducteur` | `User@2026!`   | Conducteur de travaux |

---

## API — endpoints principaux (préfixe `/v1`)

### Auth
- `POST /auth/login` → `{ access_token, user }` + cookie `refresh_token` (HttpOnly)
- `POST /auth/refresh` → `{ access_token }` (lit le cookie)
- `POST /auth/logout` → invalide le refresh token
- `GET /auth/me` → profil (sans `passwordHash`)
- `PATCH /auth/change-password` — un compte avec `mustChangePassword=true` (créé par un
  admin) est **forcé** vers `/change-password` à la 1ʳᵉ connexion avant tout accès.
- `GET /health` → sonde de disponibilité (publique, utilisée par Railway)

### Users (admin)
- `GET /users` (filtres `role`, `isActive`) · `POST /users` · `GET /users/:id`
- `PATCH /users/:id` · `DELETE /users/:id` (désactivation) · `GET /users/:id/sites`

### Sites
- `GET /sites` (isolation par rôle) · `POST /sites` · `GET /sites/:id`
- `PATCH /sites/:id` · `DELETE /sites/:id` (archivage)
- `GET /sites/:id/members` · `POST /sites/:id/members` · `DELETE /sites/:id/members/:userId`
- `GET /sites/:id/kpi`

---

## Sécurité

- JWT access (15 min) + refresh token opaque (7 j, cookie HttpOnly / SameSite=Strict, stocké en base).
- Mots de passe : **bcrypt** (rounds = 12).
- RBAC hiérarchique : `ADMIN > DIRECTEUR_PROJET > DIRECTEUR_TRAVAUX > CONDUCTEUR_TRAVAUX` (`RolesGuard`).
- Isolation des données : DT/CT ne voient que leurs chantiers (`SiteMember`).
- Rate-limiting global (Throttler) + 10 tentatives de login / 15 min.
- Journalisation des connexions dans `AuditLog`.

---

## Tests

```bash
cd backend
npm test            # tous les specs
npm run test:cov    # couverture (objectif > 70 % sur les services)
```

Specs : `auth.service.spec.ts`, `users.service.spec.ts`, `sites.service.spec.ts`, `roles.guard.spec.ts`
(40 tests, ~85 % de couverture sur les services).

---

## Déploiement en production

Voir **[DEPLOY.md](DEPLOY.md)** — déploiement Railway en 3 services (Postgres + backend + frontend),
via les `Dockerfile` et `railway.json` fournis (build + migrations + run validés localement).

---

## Charte graphique CSE

| Couleur          | Hex       |
|------------------|-----------|
| Cyan (primaire)  | `#00AEEF` |
| Bleu marine      | `#003366` |
| Vert             | `#1E7A3C` |
| Orange           | `#F0A500` |
| Rouge            | `#A32D2D` |

---

## Structure

```
cnn-btp-manager/
├── backend/      # API NestJS + Prisma
├── frontend/     # SPA React + Vite
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

*CNN-BTPManager-Pro — CSE Immobilier — Confidentiel*

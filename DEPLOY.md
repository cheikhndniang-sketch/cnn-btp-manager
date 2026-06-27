# Déploiement en production — Railway

CNN-BTPManager-Pro se déploie en **3 services Railway** dans un même projet :

1. **PostgreSQL** (plugin Railway)
2. **Backend** (`backend/`, Dockerfile → API NestJS)
3. **Frontend** (`frontend/`, Dockerfile → SPA servie par `serve`)

Les `Dockerfile` et `railway.json` de chaque service sont déjà fournis et **validés localement** (build + run + migrations + login OK).

---

## Prérequis

- Un compte [Railway](https://railway.app) et le dépôt poussé sur GitHub.
- (Optionnel) la CLI : `npm i -g @railway/cli` puis `railway login`.

---

## 1. Base de données

Dans le projet Railway → **New → Database → PostgreSQL**.
Railway crée la variable `DATABASE_URL` (référencée par le backend à l'étape 2).

---

## 2. Service Backend

**New → GitHub Repo →** sélectionner le dépôt, puis dans les **Settings** du service :

- **Root Directory** : `backend`
- **Builder** : Dockerfile (auto-détecté via `backend/railway.json`)
- **Healthcheck path** : `/v1/health` (déjà dans `railway.json`)

**Variables** (Settings → Variables) :

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence le service Postgres) |
| `JWT_SECRET` | *secret aléatoire ≥ 32 octets* — `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | *autre* secret aléatoire, différent du précédent |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `BCRYPT_ROUNDS` | `12` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | URL publique du frontend (étape 3), ex. `https://cnn-btp-front.up.railway.app` |
| `THROTTLE_TTL` | `60` |
| `THROTTLE_LIMIT` | `100` |

> `PORT` est injecté automatiquement par Railway — ne pas le définir.

Le conteneur exécute `prisma migrate deploy` au démarrage : **les tables sont créées automatiquement** à la première mise en ligne.

### Seed (une seule fois)

Le seed n'est pas exécuté automatiquement en prod. Après le premier déploiement :

```bash
railway run --service <backend> npm run prisma:seed
```

> ⚠️ Changez immédiatement les mots de passe par défaut. Les comptes créés ensuite
> via `/v1/users` ont `mustChangePassword=true` et sont forcés de le changer à la 1ʳᵉ connexion.

---

## 3. Service Frontend

**New → GitHub Repo →** même dépôt, autre service. **Settings** :

- **Root Directory** : `frontend`
- **Builder** : Dockerfile (auto-détecté)

**Variable de build** (Settings → Variables) :

| Variable | Valeur |
|----------|--------|
| `VITE_API_URL` | URL publique du backend + `/v1`, ex. `https://cnn-btp-api.up.railway.app/v1` |

> `VITE_API_URL` est lue **au moment du build** (injectée comme build-arg du Dockerfile).
> Si vous changez l'URL de l'API, **redéployez le frontend** pour la régénérer.

Générez un domaine public pour chaque service (Settings → Networking → **Generate Domain**).

---

## 4. Ordre de mise en route & dépendance circulaire d'URL

Le backend a besoin de `FRONTEND_URL` (CORS) et le frontend de `VITE_API_URL` (API).
Procédure simple :

1. Déployez backend + frontend une première fois, générez leurs domaines.
2. Renseignez `FRONTEND_URL` (backend) et `VITE_API_URL` (frontend) avec les domaines obtenus.
3. Redéployez les deux services.

---

## 5. Points de sécurité production (déjà câblés dans le code)

- **Cookie refresh** : en `NODE_ENV=production`, il passe en `SameSite=None; Secure`
  (obligatoire car SPA et API sont sur des domaines distincts). En dev, il reste `Strict`.
- **`trust proxy`** activé en production (cookies `Secure` + `req.ip` corrects derrière le proxy Railway).
- **CORS** restreint à `FRONTEND_URL` avec `credentials: true`.
- **Helmet**, **Throttler** (10 tentatives de login / 15 min), **bcrypt rounds=12**, **AuditLog**.

---

## 6. Vérification post-déploiement

```bash
curl https://<backend-domain>/v1/health         # {"status":"ok",...}
# Login depuis le frontend : la connexion doit poser le cookie refresh et rester active
# (vérifier dans l'onglet Réseau que /v1/auth/refresh renvoie 200 après expiration du token).
```

---

## Alternative : frontend sur Vercel/Netlify

Le frontend étant un build statique Vite, il peut aussi être hébergé sur Vercel/Netlify :
build `npm run build`, dossier `dist/`, variable `VITE_API_URL`, et une règle de
rewrite SPA `/* → /index.html`. Dans ce cas, n'utilisez que les services Postgres + Backend sur Railway.

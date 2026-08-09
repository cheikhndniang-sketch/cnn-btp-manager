# Déploiement sur VPS — CNN-BTPManager-Pro

Migration depuis Railway vers un serveur autonome (~5 €/mois), sans
expiration surprise et avec sauvegardes automatiques.

---

## Architecture

Un seul domaine, routage par chemin assuré par Caddy :

```
                    ┌─────────────── VPS ────────────────┐
  Internet  :443 →  │  Caddy (HTTPS auto Let's Encrypt)  │
                    │    /v1/*  → backend  (NestJS)      │
                    │    /*     → frontend (React SPA)   │
                    │                ↓                   │
                    │           PostgreSQL               │
                    │        (réseau interne only)       │
                    │                ↓                   │
                    │      backup (dump quotidien)       │
                    └────────────────────────────────────┘
```

**Pourquoi un seul domaine** : frontend et API partagent la même origine,
donc aucun CORS à configurer et le cookie de rafraîchissement
(`HttpOnly`, `SameSite=Strict`) fonctionne nativement.

**La base n'est jamais exposée sur Internet** — pas de `ports:` sur le
service `db`, elle n'est joignable que depuis les autres conteneurs.

---

## 1. Choisir et commander le VPS

| Fournisseur | Offre | Prix | Remarque |
|---|---|---|---|
| **Hetzner** | CX22 — 2 vCPU, 4 Go RAM, 40 Go | ~4,5 €/mois | Meilleur rapport qualité/prix (datacenters Allemagne/Finlande) |
| **OVH** | VPS Starter | ~5 €/mois | Entreprise française, paiement souvent plus simple depuis l'Afrique |
| **Contabo** | VPS S | ~5 €/mois | Plus de ressources, performances variables |

4 Go de RAM suffisent largement (build inclus). Prendre **Ubuntu 24.04 LTS**.

---

## 2. Préparer le serveur

Se connecter en SSH puis, **en root** :

```bash
curl -fsSL https://raw.githubusercontent.com/cheikhndniang-sketch/cnn-btp-manager/main/deploy/install-vps.sh -o install-vps.sh
bash install-vps.sh
```

Le script installe Docker, active le pare-feu (SSH/HTTP/HTTPS uniquement),
met en place fail2ban et clone le dépôt dans `/opt/cnn-btp`.

---

## 3. Configurer les secrets

```bash
cd /opt/cnn-btp/deploy
cp .env.prod.example .env
nano .env
```

Générer chaque secret séparément :

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET  (différent du précédent !)
```

Renseigner `DOMAIN` avec votre domaine (ex. `btp.cse-immobilier.sn`).

---

## 4. Pointer le domaine

Chez votre registrar, créer un enregistrement **A** :

```
btp.votre-domaine.sn.   A   <IP_DU_VPS>
```

Vérifier la propagation : `dig +short btp.votre-domaine.sn`

---

## 5. Démarrer

```bash
cd /opt/cnn-btp/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Le premier build prend 3–5 minutes. Caddy obtient le certificat HTTPS
automatiquement dès que le DNS est propagé.

Suivre le démarrage :

```bash
docker compose -f docker-compose.prod.yml logs -f
```

---

## 6. Restaurer les données Sandaga

### a) Récupérer le dump depuis Railway

**À faire dès qu'un plan Railway est actif** (les données du chantier ne sont
récupérables que là) :

```bash
railway run --service Postgres -- pg_dump --no-owner --no-acl \
  --format=custom --file=sandaga.dump
```

Ou depuis l'interface : projet → service **Postgres** → onglet **Data** → **Export**.

### b) Transférer et restaurer sur le VPS

```bash
scp sandaga.dump root@<IP_DU_VPS>:/opt/cnn-btp/deploy/backups/

cd /opt/cnn-btp/deploy
docker compose -f docker-compose.prod.yml cp \
  backups/sandaga.dump db:/tmp/sandaga.dump

docker compose -f docker-compose.prod.yml exec db \
  pg_restore --no-owner --no-acl --clean --if-exists \
  -U cnn -d cnn_btp /tmp/sandaga.dump
```

### c) Sans dump (repartir de zéro)

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
```

---

## Sauvegardes automatiques

Le service `backup` réalise un dump **chaque jour**, conservé 30 jours dans
`/opt/cnn-btp/deploy/backups/`.

```bash
ls -lh /opt/cnn-btp/deploy/backups/          # lister
docker compose -f docker-compose.prod.yml logs backup   # vérifier
```

### Copie hors du serveur — indispensable

Un dump qui ne vit que sur le serveur ne protège pas d'une perte du serveur.
Depuis **votre PC**, récupérer les sauvegardes régulièrement :

```powershell
scp -r root@<IP_DU_VPS>:/opt/cnn-btp/deploy/backups C:\Users\ProBooK\Backups\cnn-btp-manager\
```

Pour automatiser vers un stockage objet (~1 €/mois), voir `rclone` avec
Backblaze B2 ou Hetzner Storage Box.

---

## Exploitation courante

```bash
cd /opt/cnn-btp/deploy

# Mettre à jour l'application après un push GitHub
git -C /opt/cnn-btp pull
docker compose -f docker-compose.prod.yml up -d --build

# Journaux
docker compose -f docker-compose.prod.yml logs -f backend

# Sauvegarde manuelle immédiate
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U cnn --format=custom cnn_btp > backups/manuel-$(date +%F).dump

# Redémarrer / arrêter
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml down        # arrêt (données conservées)
```

---

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Pas de HTTPS | DNS non propagé | `dig +short <domaine>` doit renvoyer l'IP du VPS ; puis `docker compose restart caddy` |
| `502 Bad Gateway` | Backend en cours de démarrage ou en erreur | `docker compose logs backend` |
| Backend redémarre en boucle | `DATABASE_URL` ou migration en échec | `docker compose logs backend` ; vérifier `.env` |
| Connexion refusée par l'API | `FRONTEND_URL` incohérent | Doit valoir `https://${DOMAIN}` |
| Anciennes pages sur mobile | Service worker en cache | Caddy envoie déjà `no-cache` sur `/sw.js` ; sinon désinstaller/réinstaller la PWA |

---

## Coût mensuel

| Poste | Coût |
|---|---|
| VPS (Hetzner CX22) | ~4,5 € |
| Nom de domaine | ~1 €/mois (12 €/an) |
| Stockage sauvegardes (optionnel) | ~1 € |
| **Total** | **~5–7 €/mois** |

À comparer aux ~5 $/mois de Railway, mais **sans expiration d'essai**, avec
les données maîtrisées et des sauvegardes automatiques.

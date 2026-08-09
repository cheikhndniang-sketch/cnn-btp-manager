# Mise en ligne — cnn-btpmanager.com

Guide pas à pas, de zéro à l'application accessible en HTTPS.
**Durée : ~45 min** (dont 10–30 min d'attente DNS).

---

## Étape 1 — Domaine ✅ FAIT

`cnn-btpmanager.com` est enregistré et géré par **Cloudflare**
(serveurs de noms `cosmin.ns.cloudflare.com` / `lady.ns.cloudflare.com`).

Il ne reste qu'à le faire pointer vers le VPS (étape 3).

---

## Étape 2 — Commander le VPS (~4,5 €/mois)

**Hetzner CX22** (recommandé) — 2 vCPU, 4 Go RAM, 40 Go SSD
→ <https://console.hetzner.cloud>

Au moment de la commande :
- **Image** : Ubuntu 24.04 LTS
- **Localisation** : Falkenstein ou Helsinki (bonne latence vers Dakar)
- **SSH Key** : ajoutez votre clé publique (voir ci-dessous) — plus sûr qu'un mot de passe

### Créer une clé SSH depuis Windows

```powershell
ssh-keygen -t ed25519 -C "cnn-btp"
```

Appuyez sur Entrée à chaque question. Puis affichez la clé **publique** à
coller chez Hetzner :

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

À la fin, notez l'**adresse IPv4** du serveur (ex. `78.47.xx.xx`).

---

## Étape 3 — Faire pointer le domaine vers le VPS (Cloudflare)

Sur <https://dash.cloudflare.com> → domaine `cnn-btpmanager.com` → **DNS**.

Créez **deux** enregistrements :

| Type | Nom | Contenu (IPv4) | Proxy |
|---|---|---|---|
| `A` | `@` | `<IP_DU_VPS>` | 🔘 **DNS only** (nuage **gris**) |
| `A` | `www` | `<IP_DU_VPS>` | 🔘 **DNS only** (nuage **gris**) |

### ⚠️ Le nuage doit être GRIS, pas orange

C'est le point qui fait échouer la plupart des installations.

Avec le proxy Cloudflare activé (nuage **orange**), le trafic passe par
Cloudflare : Caddy ne peut alors **pas obtenir son certificat Let's Encrypt**,
et le mode SSL « Flexible » provoque une boucle de redirection infinie.

Cliquez sur le nuage orange pour le passer en gris (« DNS only »).

> Vous pourrez réactiver le proxy plus tard, **une fois le HTTPS
> fonctionnel**, en réglant d'abord SSL/TLS → **Full (strict)** dans
> Cloudflare. Ce n'est pas nécessaire pour démarrer.

**Vérifier la propagation** (depuis votre PC) :

```powershell
nslookup cnn-btpmanager.com 8.8.8.8
```

Continuez seulement quand **l'IP de votre VPS** s'affiche — et non une IP
Cloudflare (`104.x` ou `172.67.x`, signe que le proxy est resté actif).
Cloudflare propage en 1 à 5 min.

---

## Étape 4 — Préparer le serveur

Connectez-vous en SSH :

```powershell
ssh root@<IP_DU_VPS>
```

Puis, **sur le serveur** :

```bash
curl -fsSL https://raw.githubusercontent.com/cheikhndniang-sketch/cnn-btp-manager/main/deploy/install-vps.sh -o install-vps.sh
bash install-vps.sh
```

Le script installe Docker, active le pare-feu (SSH/HTTP/HTTPS seulement),
met en place fail2ban et clone le projet dans `/opt/cnn-btp`.

---

## Étape 5 — Configurer les secrets

Toujours sur le serveur :

```bash
cd /opt/cnn-btp/deploy
cp .env.prod.example .env
```

Générez les trois secrets (copiez chaque résultat) :

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"
```

Ouvrez le fichier et collez-les :

```bash
nano .env
```

`DOMAIN` est déjà réglé sur `cnn-btpmanager.com`.
Enregistrez avec `Ctrl+O`, `Entrée`, puis `Ctrl+X`.

> ⚠️ `JWT_SECRET` et `JWT_REFRESH_SECRET` doivent être **différents**.

---

## Étape 6 — Démarrer l'application

```bash
cd /opt/cnn-btp/deploy
docker compose -f docker-compose.prod.yml up -d --build
```

Le premier build prend 3 à 5 minutes. Suivez le démarrage :

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Attendez de voir `🚀 CNN-BTPManager API démarrée`, puis `Ctrl+C` pour quitter
les logs (les services continuent de tourner).

---

## Étape 7 — Créer le premier administrateur

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
```

Les identifiants s'affichent à la fin. **Changez le mot de passe dès la
première connexion.**

---

## ✅ C'est en ligne

<https://cnn-btpmanager.com>

Le certificat HTTPS est obtenu automatiquement par Caddy.

### Installer sur les smartphones du chantier
- **Android/Chrome** : menu ⋮ → « Installer l'application »
- **iPhone/Safari** : Partager → « Sur l'écran d'accueil »

La saisie hors-ligne (pointages, avancement, photos géolocalisées) fonctionne
dès l'installation.

---

## Étape 8 — Récupérer les données Sandaga

Les 82 ouvriers, salaires et pointages sont **toujours sur Railway** et ne
peuvent en sortir qu'avec un plan actif.

**Dès que Railway est réactivé**, depuis votre PC :

```powershell
railway run --service Postgres -- pg_dump --no-owner --no-acl --format=custom --file=sandaga.dump
```

Puis transférez et restaurez :

```powershell
scp sandaga.dump root@<IP_DU_VPS>:/opt/cnn-btp/deploy/backups/
```

Sur le serveur :

```bash
cd /opt/cnn-btp/deploy
docker compose -f docker-compose.prod.yml cp backups/sandaga.dump db:/tmp/s.dump
docker compose -f docker-compose.prod.yml exec db \
  pg_restore --no-owner --no-acl --clean --if-exists -U cnn -d cnn_btp /tmp/s.dump
```

---

## Après la mise en ligne

### Récupérer les sauvegardes sur votre PC (à faire chaque semaine)

```powershell
scp -r root@<IP_DU_VPS>:/opt/cnn-btp/deploy/backups C:\Users\ProBooK\Backups\cnn-btp-manager\
```

Le serveur crée un dump chaque jour, mais **une copie hors du serveur reste
indispensable** — c'est exactement ce qui a manqué avec Railway.

### Mettre à jour l'application

```bash
git -C /opt/cnn-btp pull
cd /opt/cnn-btp/deploy && docker compose -f docker-compose.prod.yml up -d --build
```

---

## En cas de problème

| Symptôme | Action |
|---|---|
| Pas de HTTPS / erreur de certificat | **Vérifiez d'abord le nuage gris** sur Cloudflare (étape 3). Si `nslookup` renvoie une IP `104.x`/`172.67.x`, le proxy est encore actif et bloque Let's Encrypt. Une fois corrigé : `docker compose -f docker-compose.prod.yml restart caddy` |
| Boucle de redirection infinie | Proxy Cloudflare orange + SSL « Flexible ». Passez le nuage en gris, ou SSL/TLS → **Full (strict)** |
| `502 Bad Gateway` | Backend en démarrage : `docker compose -f docker-compose.prod.yml logs backend` |
| Backend redémarre en boucle | Secret manquant dans `.env` : `docker compose -f docker-compose.prod.yml logs backend` |
| Connexion SSH refusée | Vérifiez l'IP et que votre clé SSH est bien enregistrée chez Hetzner |

**Envoyez-moi la sortie de `docker compose logs` en cas de blocage** — c'est
la première chose à regarder.

---

## Coût récapitulatif

| Poste | Coût |
|---|---|
| Domaine `.com` | ~1 €/mois (12 €/an) |
| VPS Hetzner CX22 | ~4,5 €/mois |
| **Total** | **~5,5 €/mois** |

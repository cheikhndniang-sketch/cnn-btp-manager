# Mise en ligne — cnn-btpmanager.com

Guide pas à pas, de zéro à l'application accessible en HTTPS.
**Durée : ~45 min** (dont 10–30 min d'attente DNS).

---

## Étape 1 — Domaine ✅ FAIT

`cnn-btpmanager.com` est enregistré et géré par **Cloudflare**
(serveurs de noms `cosmin.ns.cloudflare.com` / `lady.ns.cloudflare.com`).

Il ne reste qu'à le faire pointer vers le VPS (étape 3).

---

## Étape 2 — VPS OVH ✅ FAIT

VPS commandé chez OVH. Récupérez son **adresse IPv4** dans
[l'espace client OVH](https://www.ovh.com/manager) → *Bare Metal Cloud* → *VPS*.

- **Système** : Ubuntu 24.04 LTS (si un autre système a été installé,
  réinstallez depuis l'espace client)
- **Utilisateur SSH** : `ubuntu` (spécificité OVH)

> OVH envoie un e-mail avec les accès à la livraison. Si vous n'avez pas
> fourni de clé SSH, un mot de passe root y figure — vous pourrez vous
> connecter avec, puis suivre l'étape 4 normalement.

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

## Étape 4 — Préparer le serveur (OVH)

### Se connecter en SSH

Sur OVH, l'utilisateur par défaut est **`ubuntu`** (et non `root`) :

```powershell
ssh ubuntu@<IP_DU_VPS>
```

> OVH envoie les informations de connexion par e-mail à la livraison du VPS.
> Si vous avez fourni une clé SSH, la connexion se fait sans mot de passe.
> Répondez `yes` à la question sur l'empreinte, à la première connexion.

### Lancer l'installation

**Sur le serveur** — noter le `sudo`, indispensable sur OVH :

```bash
curl -fsSL https://raw.githubusercontent.com/cheikhndniang-sketch/cnn-btp-manager/main/deploy/install-vps.sh -o install-vps.sh
sudo bash install-vps.sh
```

Le script installe Docker, active le pare-feu (SSH/HTTP/HTTPS seulement),
met en place fail2ban, clone le projet dans `/opt/cnn-btp` et vous autorise
à utiliser Docker sans `sudo`.

### ⚠️ Se reconnecter ensuite

Le droit d'utiliser Docker ne prend effet qu'à la reconnexion :

```bash
exit
```

```powershell
ssh ubuntu@<IP_DU_VPS>
```

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
| Connexion SSH refusée | Sur OVH, l'utilisateur est `ubuntu`, pas `root`. Vérifiez l'IP dans l'espace client |
| `permission denied` sur docker | Vous ne vous êtes pas reconnecté après l'installation : `exit` puis `ssh ubuntu@<IP>` |
| `Cannot connect to the Docker daemon` | Idem — reconnectez-vous en SSH |

**Envoyez-moi la sortie de `docker compose logs` en cas de blocage** — c'est
la première chose à regarder.

---

## Coût récapitulatif

| Poste | Coût |
|---|---|
| Domaine `.com` | ~1 €/mois (12 €/an) |
| VPS Hetzner CX22 | ~4,5 €/mois |
| **Total** | **~5,5 €/mois** |

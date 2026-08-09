#!/usr/bin/env bash
# Préparation d'un VPS Ubuntu 22.04/24.04 neuf pour CNN-BTPManager-Pro.
#
# À exécuter EN ROOT sur le VPS, une seule fois :
#   bash install-vps.sh
#
# Installe Docker, durcit le pare-feu et prépare l'arborescence.
# Le déploiement lui-même se fait ensuite avec docker compose (voir README).

set -euo pipefail

APP_DIR=/opt/cnn-btp
REPO=https://github.com/cheikhndniang-sketch/cnn-btp-manager.git

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Ce script doit être lancé en root (sudo)."; exit 1; }

say "Mise à jour du système"
apt-get update -qq
apt-get upgrade -y -qq

say "Installation des outils de base"
apt-get install -y -qq ca-certificates curl gnupg git ufw fail2ban

say "Installation de Docker"
if ! command -v docker >/dev/null 2>&1; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
		gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
		>/etc/apt/sources.list.d/docker.list
	apt-get update -qq
	apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
		docker-buildx-plugin docker-compose-plugin
	systemctl enable --now docker
else
	echo "Docker déjà présent — étape ignorée."
fi

say "Configuration du pare-feu (SSH + HTTP + HTTPS uniquement)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# La base PostgreSQL n'est pas exposée : elle reste sur le réseau Docker interne.

say "Protection contre les attaques SSH par force brute"
systemctl enable --now fail2ban

say "Récupération du code"
if [ -d "$APP_DIR/.git" ]; then
	git -C "$APP_DIR" pull --ff-only
else
	git clone --depth 1 "$REPO" "$APP_DIR"
fi

mkdir -p "$APP_DIR/deploy/backups"
chmod +x "$APP_DIR/deploy/backup.sh"

cat <<'EOF'

╭──────────────────────────────────────────────────────────────╮
│  Serveur prêt.                                               │
╰──────────────────────────────────────────────────────────────╯

Étapes suivantes :

  1. Configurer les secrets
       cd /opt/cnn-btp/deploy
       cp .env.prod.example .env
       nano .env
     Générer les mots de passe avec :  openssl rand -base64 32

  2. Faire pointer votre domaine (enregistrement A) vers l'IP de ce serveur,
     puis attendre la propagation DNS (quelques minutes).

  3. Démarrer l'application
       docker compose -f docker-compose.prod.yml up -d --build

  4. Créer le premier utilisateur administrateur
       docker compose -f docker-compose.prod.yml exec backend npx prisma db seed

Le HTTPS est obtenu automatiquement par Caddy au premier démarrage.
EOF

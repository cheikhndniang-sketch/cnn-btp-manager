#!/usr/bin/env bash
# Installation du connecteur Messagerie CSE Immobilier sur le VPS de CNN-BTPManager-Pro.
# Lancer depuis le PC :  ssh -t ubuntu@57.128.67.123 "sudo bash ~/messagerie-cse/installer.sh"
set -euo pipefail

DOMAINE_APP="cnn-btpmanager.com"
SOUS_DOMAINE="mail.${DOMAINE_APP}"
CIBLE=/opt/messagerie-cse
SOURCE="$(cd "$(dirname "$0")" && pwd)"

etape() { echo; echo "==> $*"; }

etape "1/6 Recherche du conteneur Caddy de l'application"
CADDY=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /caddy/ {print $1; exit}')
[ -n "$CADDY" ] || { echo "ERREUR : aucun conteneur Caddy en marche."; exit 1; }
RESEAU=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY" | awk '{print $1}')
CADDYFILE=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")
echo "Caddy : $CADDY | réseau : $RESEAU | Caddyfile : $CADDYFILE"
[ -f "$CADDYFILE" ] || { echo "ERREUR : Caddyfile introuvable."; exit 1; }

etape "2/6 Vérification du DNS de $SOUS_DOMAINE"
IP_VPS=$(curl -fsS -4 https://api.ipify.org || true)
IP_DNS=$(getent ahostsv4 "$SOUS_DOMAINE" | awk 'NR==1{print $1}' || true)
echo "IP du VPS : ${IP_VPS:-?} | $SOUS_DOMAINE -> ${IP_DNS:-non résolu}"
if [ "$IP_DNS" != "$IP_VPS" ]; then
  echo "ATTENTION : $SOUS_DOMAINE ne pointe pas encore vers ce VPS."
  echo "Créez dans Cloudflare : type A, nom « mail », contenu $IP_VPS, nuage GRIS (DNS only)."
  read -rp "Continuer quand même ? Le certificat HTTPS sera obtenu dès que le DNS sera à jour. (o/N) " r
  [[ "$r" =~ ^[oO]$ ]] || exit 1
fi

etape "3/6 Copie des fichiers dans $CIBLE"
mkdir -p "$CIBLE"
cp "$SOURCE"/{serveur.py,oauth.py,Dockerfile,requirements.txt,docker-compose.yml} "$CIBLE"/

etape "4/6 Configuration (.env)"
if [ -f "$CIBLE/.env" ]; then
  echo ".env déjà présent : conservé."
  JETON=$(grep '^JETON_ACCES=' "$CIBLE/.env" | cut -d= -f2-)
  PHRASE=$(grep '^PHRASE_DE_PASSE=' "$CIBLE/.env" | cut -d= -f2-)
else
  read -rsp "Mot de passe de la boîte cheikh.niang@cseimmobilier.sn : " MDP; echo
  [ -n "$MDP" ] || { echo "Mot de passe vide."; exit 1; }
  JETON=$(openssl rand -hex 32)
  PHRASE=$(openssl rand -hex 10)
  umask 077
  cat > "$CIBLE/.env" <<CONF
DOMAINE=$SOUS_DOMAINE
RESEAU_CADDY=$RESEAU
IMAP_HOTE=us3.imap.mailhostbox.com
IMAP_PORT=993
IMAP_UTILISATEUR=cheikh.niang@cseimmobilier.sn
IMAP_MOT_DE_PASSE=$MDP
ENVOI_ACTIVE=oui
SMTP_HOTE=us3.smtp.mailhostbox.com
SMTP_PORT=587
NOM_EXPEDITEUR=Cheikh Ndiobo NIANG
JETON_ACCES=$JETON
# Connexion OAuth : claude.ai ne propose pas toujours le champ « En-têtes de
# requête ». La phrase de passe ci-dessous est demandée une seule fois, sur la
# page de connexion servie par ce serveur, quand on relie le connecteur.
PHRASE_DE_PASSE=$PHRASE
DOSSIER_DONNEES=/donnees
CONF
  chmod 600 "$CIBLE/.env"
fi

etape "5/6 Construction et démarrage du connecteur"
cd "$CIBLE"
docker compose up -d --build
sleep 5
docker exec -i messagerie-cse python - <<'PY'
import imaplib, os, ssl
c = imaplib.IMAP4_SSL(os.environ["IMAP_HOTE"], int(os.environ["IMAP_PORT"]), ssl_context=ssl.create_default_context(), timeout=20)
c.login(os.environ["IMAP_UTILISATEUR"], os.environ["IMAP_MOT_DE_PASSE"])
print("Connexion à la boîte mail : OK (" + str(len(c.list()[1])) + " dossiers)")
c.logout()
PY

etape "6/6 Ajout de $SOUS_DOMAINE dans Caddy"
if grep -q "Connecteur Messagerie CSE Immobilier" "$CADDYFILE"; then
  echo "Bloc déjà présent dans le Caddyfile."
else
  cp "$CADDYFILE" "$CADDYFILE.avant-messagerie.bak"
  # Ajout par >> : le fichier monté dans le conteneur reste le même.
  cat >> "$CADDYFILE" <<BLOC

# Connecteur Messagerie CSE Immobilier pour Claude
$SOUS_DOMAINE {
	encode gzip
	reverse_proxy messagerie-cse:8000
}
BLOC
fi
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "Attente du certificat HTTPS..."
for i in $(seq 1 12); do
  if curl -fsS "https://$SOUS_DOMAINE/sante" >/dev/null 2>&1; then OK=1; break; fi; sleep 5
done
curl -fsS -o /dev/null -w "Application CNN-BTPManager-Pro : HTTP %{http_code}\n" "https://$DOMAINE_APP" || true

echo
echo "================================================================"
if [ "${OK:-0}" = 1 ]; then echo " Connecteur en ligne : https://$SOUS_DOMAINE/sante -> ok"
else echo " Connecteur démarré ; HTTPS pas encore prêt (DNS ?). Revérifier : https://$SOUS_DOMAINE/sante"; fi
echo
echo " À saisir dans Claude (Personnaliser > Connecteurs > Ajouter un connecteur personnalisé) :"
echo "   URL            : https://$SOUS_DOMAINE/mcp"
echo "   Authentification : « Se connecter » (OAuth) — pas d'en-tête à remplir."
echo "   Phrase de passe demandée une fois sur la page de connexion : $PHRASE"
echo
echo " Si le compte propose le champ « En-têtes de requête », le jeton fixe marche aussi :"
echo "   En-tête: Authorization   Valeur : Bearer $JETON"
echo "================================================================"

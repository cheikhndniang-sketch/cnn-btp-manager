#!/bin/sh
# Sauvegarde automatique quotidienne de PostgreSQL.
#
# Leçon de l'incident Railway (août 2026) : un hébergeur peut couper les
# services du jour au lendemain et rendre la base inaccessible. Une copie
# hors de l'hébergeur est la seule protection.
#
# Les dumps sont écrits dans ./backups (monté depuis le VPS) au format
# `custom` de PostgreSQL, restaurable avec pg_restore.

set -eu

BACKUP_DIR=/backups
RETENTION="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

run_backup() {
	stamp=$(date +%Y%m%d-%H%M%S)
	target="$BACKUP_DIR/cnn_btp-$stamp.dump"

	if pg_dump --no-owner --no-acl --format=custom --file="$target" 2>/tmp/pgdump.err; then
		size=$(du -h "$target" | cut -f1)
		log "OK  $target ($size)"

		# Rotation : on supprime les dumps plus vieux que RETENTION jours,
		# mais jamais le dernier (protection si la base devient injoignable).
		total=$(find "$BACKUP_DIR" -name 'cnn_btp-*.dump' | wc -l)
		if [ "$total" -gt 1 ]; then
			find "$BACKUP_DIR" -name 'cnn_btp-*.dump' -mtime "+$RETENTION" -delete
		fi
	else
		log "ECHEC : $(cat /tmp/pgdump.err)"
		# On ne quitte pas : on retentera au prochain cycle.
	fi
}

log "service demarre — sauvegarde quotidienne, retention ${RETENTION} jours"

# Première sauvegarde au démarrage, puis toutes les 24 h.
while true; do
	run_backup
	sleep 86400
done

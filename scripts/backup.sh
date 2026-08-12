#!/bin/bash
#
# Kamerinos SPA — Database Backup Script
# Ejecutar con cron: 0 3 * * * /opt/kamerinos/backup.sh >> /var/log/kamerinos-backup.log 2>&1
#

set -e

DB_NAME="${DB_NAME:-kamerinos_db}"
DB_USER="${DB_USER:-admin}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

BACKUP_DIR="${BACKUP_DIR:-/opt/kamerinos/backups}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-28}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-90}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)
DAY_OF_MONTH=$(date +%d)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup diario..."

mkdir -p "$BACKUP_DIR/daily"

export PGPASSWORD="${DB_PASSWORD:-Colombia2026*}"

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -Fc \
  --no-owner \
  --no-acl \
  -f "$BACKUP_DIR/daily/$TIMESTAMP.dump"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup diario creado: $BACKUP_DIR/daily/$TIMESTAMP.dump ($(du -h "$BACKUP_DIR/daily/$TIMESTAMP.dump" | cut -f1))"

find "$BACKUP_DIR/daily" -type f -name "*.dump" -mtime +$RETENTION_DAILY -delete -exec echo "[$(date '+%Y-%m-%d %H:%M:%S')] Eliminado backup antiguo: {}" \;

if [ "$DAY_OF_WEEK" = "7" ]; then
  mkdir -p "$BACKUP_DIR/weekly"
  cp "$BACKUP_DIR/daily/$TIMESTAMP.dump" "$BACKUP_DIR/weekly/$TIMESTAMP.dump"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup semanal guardado: $BACKUP_DIR/weekly/$TIMESTAMP.dump"
  find "$BACKUP_DIR/weekly" -type f -name "*.dump" -mtime +$RETENTION_WEEKLY -delete
fi

if [ "$DAY_OF_MONTH" = "01" ]; then
  mkdir -p "$BACKUP_DIR/monthly"
  cp "$BACKUP_DIR/daily/$TIMESTAMP.dump" "$BACKUP_DIR/monthly/$TIMESTAMP.dump"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup mensual guardado: $BACKUP_DIR/monthly/$TIMESTAMP.dump"
  find "$BACKUP_DIR/monthly" -type f -name "*.dump" -mtime +$RETENTION_MONTHLY -delete
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completado."
echo "---"

#!/bin/bash
#
# Kamerinos SPA — Database Restore Script
# Uso: ./restore.sh 20260812_030000.dump
# Ejemplo: ./restore.sh /opt/kamerinos/backups/daily/20260812_030000.dump
#

set -e

if [ -z "$1" ]; then
  echo "Uso: $0 <archivo.dump>"
  echo ""
  echo "Backups disponibles:"
  find /opt/kamerinos/backups -name "*.dump" -type f 2>/dev/null | sort -r | head -20 || echo "  (no se encontraron backups)"
  exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${DB_NAME:-kamerinos_db}"
DB_USER="${DB_USER:-admin}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: archivo no encontrado: $BACKUP_FILE"
  exit 1
fi

export PGPASSWORD="${DB_PASSWORD:-Colombia2026*}"

echo "ATENCION: Esto sobrescribira la base de datos '$DB_NAME' en $DB_HOST:$DB_PORT"
echo "Archivo de backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
read -p "Continuar? (escribe 'SI' para confirmar): " CONFIRM

if [ "$CONFIRM" != "SI" ]; then
  echo "Cancelado."
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restaurando $DB_NAME desde $BACKUP_FILE..."

pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  -v \
  "$BACKUP_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restauracion completada."

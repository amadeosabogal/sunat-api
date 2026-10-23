#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# WODITEK SUNAT CLOUD - CRON BACKUP DIARIO (SQL SERVER)
# ==============================================================================

LOG_FILE="/var/log/mssql_backup.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/opt/mssql/data"
BACKUP_FILE="${BACKUP_DIR}/WoditekSunat_${TIMESTAMP}.bak"
RETENTION_DAYS=14

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 Iniciando respaldo diario de WoditekSunat..." | tee -a "${LOG_FILE}"

# Intentar sqlcmd primero
SQLCMD=""
if [ -x "/opt/mssql-tools18/bin/sqlcmd" ]; then
    SQLCMD="/opt/mssql-tools18/bin/sqlcmd -C"
elif [ -x "/opt/mssql-tools/bin/sqlcmd" ]; then
    SQLCMD="/opt/mssql-tools/bin/sqlcmd"
elif command -v sqlcmd &> /dev/null; then
    SQLCMD="sqlcmd"
fi

if [ -n "${SQLCMD}" ]; then
    ${SQLCMD} -S localhost,1435 -U sa -P 'Parangaricutirimicuaro.2026' -Q "
    BACKUP DATABASE [WoditekSunat] 
    TO DISK = N'${BACKUP_FILE}' 
    WITH FORMAT, COMPRESSION, CHECKSUM, STATS = 10;
    " >> "${LOG_FILE}" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Respaldo sqlcmd finalizado: ${BACKUP_FILE}" | tee -a "${LOG_FILE}"
else
    # Fallback con script Node.js
    node /var/www/sunat-api/scripts/backup-db.mjs >> "${LOG_FILE}" 2>&1
fi

# Limpieza de respaldos antiguos (más de 14 días)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🧹 Limpiando respaldos con más de ${RETENTION_DAYS} días..." | tee -a "${LOG_FILE}"
find "${BACKUP_DIR}" -name "WoditekSunat_*.bak" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✨ Proceso de respaldo finalizado con éxito." | tee -a "${LOG_FILE}"

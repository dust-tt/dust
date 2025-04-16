#!/bin/bash
# Backup script for MCP Dust Server

# Configuration
BACKUP_DIR="/backups/mcp-dust-server"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/mcp-dust-server_${TIMESTAMP}.tar.gz"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"
RETENTION_DAYS=30

# Ensure backup directory exists
mkdir -p ${BACKUP_DIR}

# Start logging
exec > >(tee -a ${LOG_FILE}) 2>&1
echo "Starting backup at $(date)"

# Create backup of environment files
echo "Backing up environment files..."
tar -czf ${BACKUP_FILE} \
    /app/.env \
    /app/.env.production \
    /app/logs \
    2>/dev/null || echo "Warning: Some files could not be backed up"

# Backup Prometheus data if available
if [ -d "/prometheus" ]; then
    echo "Backing up Prometheus data..."
    tar -czf ${BACKUP_DIR}/prometheus_${TIMESTAMP}.tar.gz /prometheus
fi

# Backup Grafana data if available
if [ -d "/var/lib/grafana" ]; then
    echo "Backing up Grafana data..."
    tar -czf ${BACKUP_DIR}/grafana_${TIMESTAMP}.tar.gz /var/lib/grafana
fi

# Clean up old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find ${BACKUP_DIR} -name "*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete
find ${BACKUP_DIR} -name "*.log" -type f -mtime +${RETENTION_DAYS} -delete

# Finish
echo "Backup completed at $(date)"
echo "Backup file: ${BACKUP_FILE}"
echo "Log file: ${LOG_FILE}"

# Optional: Upload to remote storage
# aws s3 cp ${BACKUP_FILE} s3://your-backup-bucket/mcp-dust-server/
# or
# gsutil cp ${BACKUP_FILE} gs://your-backup-bucket/mcp-dust-server/

exit 0

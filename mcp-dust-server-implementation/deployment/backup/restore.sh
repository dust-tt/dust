#!/bin/bash
# Restore script for MCP Dust Server

# Configuration
BACKUP_DIR="/backups/mcp-dust-server"
LOG_DIR="/app/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${BACKUP_DIR}/restore_${TIMESTAMP}.log"

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 /backups/mcp-dust-server/mcp-dust-server_20250416_123456.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file ${BACKUP_FILE} not found"
    exit 1
fi

# Start logging
exec > >(tee -a ${LOG_FILE}) 2>&1
echo "Starting restore at $(date)"
echo "Restoring from backup file: ${BACKUP_FILE}"

# Create a backup of current environment before restoring
echo "Creating backup of current environment..."
CURRENT_BACKUP="${BACKUP_DIR}/pre_restore_${TIMESTAMP}.tar.gz"
tar -czf ${CURRENT_BACKUP} \
    /app/.env \
    /app/.env.production \
    /app/logs \
    2>/dev/null || echo "Warning: Some files could not be backed up"
echo "Current environment backed up to: ${CURRENT_BACKUP}"

# Restore from backup
echo "Restoring environment files..."
tar -xzf ${BACKUP_FILE} -C / 2>/dev/null || echo "Warning: Some files could not be restored"

# Restore Prometheus data if available
PROMETHEUS_BACKUP=$(echo ${BACKUP_FILE} | sed 's/mcp-dust-server/prometheus/')
if [ -f "${PROMETHEUS_BACKUP}" ]; then
    echo "Restoring Prometheus data..."
    tar -xzf ${PROMETHEUS_BACKUP} -C / 2>/dev/null || echo "Warning: Prometheus data could not be restored"
fi

# Restore Grafana data if available
GRAFANA_BACKUP=$(echo ${BACKUP_FILE} | sed 's/mcp-dust-server/grafana/')
if [ -f "${GRAFANA_BACKUP}" ]; then
    echo "Restoring Grafana data..."
    tar -xzf ${GRAFANA_BACKUP} -C / 2>/dev/null || echo "Warning: Grafana data could not be restored"
fi

# Ensure proper permissions
echo "Setting proper permissions..."
if [ -d "${LOG_DIR}" ]; then
    chown -R nodejs:nodejs ${LOG_DIR}
    chmod -R 755 ${LOG_DIR}
fi

# Finish
echo "Restore completed at $(date)"
echo "Log file: ${LOG_FILE}"
echo ""
echo "IMPORTANT: You may need to restart the application for changes to take effect:"
echo "kubectl rollout restart deployment mcp-dust-server -n mcp-dust-server"
echo "or"
echo "docker-compose restart mcp-dust-server-prod"

exit 0

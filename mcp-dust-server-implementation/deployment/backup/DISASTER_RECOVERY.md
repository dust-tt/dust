# MCP Dust Server Disaster Recovery Plan

This document outlines the disaster recovery procedures for the MCP Dust Server application.

## Backup Strategy

### Automated Backups

The MCP Dust Server uses an automated backup system that performs the following:

1. Daily backups of environment files and logs
2. Daily backups of Prometheus and Grafana data (if applicable)
3. Retention of backups for 30 days

Backups are stored in the `/backups/mcp-dust-server` directory and are named with a timestamp.

### Manual Backups

Manual backups can be performed using the `backup.sh` script:

```bash
./backup.sh
```

## Recovery Procedures

### Full System Recovery

In the event of a complete system failure, follow these steps to recover:

1. Deploy a new instance of the MCP Dust Server using the Kubernetes manifests or Docker Compose files
2. Restore the latest backup using the `restore.sh` script:

```bash
./restore.sh /backups/mcp-dust-server/mcp-dust-server_YYYYMMDD_HHMMSS.tar.gz
```

3. Restart the application:

```bash
# For Kubernetes
kubectl rollout restart deployment mcp-dust-server -n mcp-dust-server

# For Docker Compose
docker-compose restart mcp-dust-server-prod
```

4. Verify the application is functioning correctly:

```bash
# For Kubernetes
kubectl get pods -n mcp-dust-server
kubectl logs -n mcp-dust-server <pod-name>

# For Docker Compose
docker-compose ps
docker-compose logs mcp-dust-server-prod
```

### Partial Recovery

For partial recovery (e.g., corrupted environment files), follow these steps:

1. Restore only the needed files from the backup:

```bash
tar -xzf /backups/mcp-dust-server/mcp-dust-server_YYYYMMDD_HHMMSS.tar.gz -C / app/.env
```

2. Restart the application as described above

## Data Integrity Verification

After recovery, verify data integrity by:

1. Checking application logs for errors
2. Verifying API endpoints are responding correctly
3. Testing key functionality (authentication, resource access, etc.)

## Recovery Testing

The disaster recovery plan should be tested quarterly to ensure it works as expected. Testing should include:

1. Performing a full recovery in a test environment
2. Verifying all application functionality
3. Documenting any issues and updating the recovery procedures

## Contact Information

In case of emergency, contact:

- Primary: [Primary Contact Name] - [Phone] - [Email]
- Secondary: [Secondary Contact Name] - [Phone] - [Email]

## Related Documentation

- [Application Documentation](../README.md)
- [Kubernetes Deployment Guide](../kubernetes/README.md)
- [Docker Deployment Guide](../docker/README.md)

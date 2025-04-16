# MCP Dust Server Deployment Guide

This guide provides instructions for deploying the MCP Dust Server in various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Monitoring Setup](#monitoring-setup)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Development Environment

- Node.js 18 or later
- npm 8 or later
- Docker and Docker Compose
- Git

### Production Environment

- Docker and Docker Compose (for container-based deployment)
- Kubernetes 1.19+ (for Kubernetes deployment)
- Prometheus and Grafana (for monitoring)

## Environment Configuration

The MCP Dust Server uses environment variables for configuration. Create the appropriate `.env` file based on your environment:

### Development

Copy the example environment file:

```bash
cp .env.example .env
```

Edit the `.env` file to set the required variables:

```
# Dust API Configuration
DUST_API_KEY=your_dust_api_key
DUST_WORKSPACE_ID=your_workspace_id
DUST_AGENT_ID=your_agent_id

# User Context
DUST_USERNAME=your_username
DUST_EMAIL=your_email
DUST_FULL_NAME=Your Full Name
DUST_TIMEZONE=America/New_York

# MCP Server Configuration
MCP_SERVER_NAME=MCP Dust Server
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=5001
MCP_SERVER_TIMEOUT=120

# Logging Configuration
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_REQUEST_BODY=true
LOG_REQUEST_HEADERS=true
LOG_RESPONSE_BODY=true
LOG_RESPONSE_HEADERS=true

# Security Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000
SECURITY_SECRET_KEY=your_secret_key
SECURITY_TOKEN_EXPIRATION=3600
SESSION_TTL=3600000

# Metrics Configuration
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
```

### Production

For production, create a `.env.production` file with more restrictive settings:

```bash
cp .env.example .env.production
```

Edit the `.env.production` file:

```
# Dust API Configuration
DUST_API_KEY=your_production_dust_api_key
DUST_WORKSPACE_ID=your_production_workspace_id
DUST_AGENT_ID=your_production_agent_id

# User Context
DUST_USERNAME=your_production_username
DUST_EMAIL=your_production_email
DUST_FULL_NAME=Your Production Full Name
DUST_TIMEZONE=UTC

# MCP Server Configuration
MCP_SERVER_NAME=MCP Dust Server
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=5001
MCP_SERVER_TIMEOUT=120

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false

# Security Configuration
CORS_ALLOWED_ORIGINS=https://your-production-domain.com
SECURITY_SECRET_KEY=your_production_secret_key
SECURITY_TOKEN_EXPIRATION=3600
SESSION_TTL=3600000

# Metrics Configuration
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
```

## Docker Deployment

### Development

To run the application in development mode using Docker:

```bash
docker-compose up mcp-dust-server-dev
```

This will start the server in development mode with hot reloading.

### Production

To run the application in production mode using Docker:

```bash
docker-compose up -d mcp-dust-server-prod
```

This will start the server in production mode as a background service.

### Building and Pushing Docker Images

To build and push the Docker image to a registry:

```bash
# Build the image
docker build -t your-registry/mcp-dust-server:latest .

# Push the image to the registry
docker push your-registry/mcp-dust-server:latest
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster
- kubectl configured to access your cluster
- Helm (optional, for chart-based deployment)

### Deployment Steps

1. Create the namespace:

```bash
kubectl apply -f deployment/kubernetes/namespace.yaml
```

2. Create the ConfigMap and Secret:

```bash
# Update the secret.yaml file with your base64-encoded values
# Example: echo -n "your_value" | base64

kubectl apply -f deployment/kubernetes/configmap.yaml
kubectl apply -f deployment/kubernetes/secret.yaml
```

3. Deploy the application:

```bash
kubectl apply -f deployment/kubernetes/deployment.yaml
kubectl apply -f deployment/kubernetes/service.yaml
kubectl apply -f deployment/kubernetes/ingress.yaml
```

4. Set up autoscaling:

```bash
kubectl apply -f deployment/kubernetes/hpa.yaml
```

5. Apply network policies:

```bash
kubectl apply -f deployment/kubernetes/network-policy.yaml
```

6. Set up pod disruption budget:

```bash
kubectl apply -f deployment/kubernetes/pdb.yaml
```

### Verifying the Deployment

Check the status of the deployment:

```bash
kubectl get pods -n mcp-dust-server
kubectl get services -n mcp-dust-server
kubectl get ingress -n mcp-dust-server
```

View the logs:

```bash
kubectl logs -n mcp-dust-server -l app=mcp-dust-server
```

### Scaling

The application will automatically scale based on the HPA configuration. To manually scale:

```bash
kubectl scale deployment mcp-dust-server -n mcp-dust-server --replicas=5
```

## Monitoring Setup

### Prometheus and Grafana

The MCP Dust Server includes built-in support for Prometheus metrics. To set up monitoring:

1. Start Prometheus and Grafana:

```bash
docker-compose up -d prometheus grafana
```

2. Access Grafana at http://localhost:3000 (default credentials: admin/admin)

3. The predefined dashboards will be automatically loaded

### Available Metrics

The MCP Dust Server exposes the following metrics:

- `mcp_dust_server_http_requests_total`: Total number of HTTP requests
- `mcp_dust_server_http_request_duration_seconds`: HTTP request duration
- `mcp_dust_server_active_sessions`: Number of active MCP sessions
- Standard Node.js metrics (memory, CPU, etc.)

## Backup and Recovery

### Creating Backups

To create a backup:

```bash
./deployment/backup/backup.sh
```

Backups are stored in the `/backups/mcp-dust-server` directory.

### Restoring from Backup

To restore from a backup:

```bash
./deployment/backup/restore.sh /backups/mcp-dust-server/mcp-dust-server_YYYYMMDD_HHMMSS.tar.gz
```

For more details, see the [Disaster Recovery Plan](backup/DISASTER_RECOVERY.md).

## Troubleshooting

### Common Issues

#### Application Won't Start

Check the logs:

```bash
# Docker
docker-compose logs mcp-dust-server-prod

# Kubernetes
kubectl logs -n mcp-dust-server -l app=mcp-dust-server
```

Verify environment variables:

```bash
# Docker
docker-compose exec mcp-dust-server-prod env

# Kubernetes
kubectl exec -n mcp-dust-server <pod-name> -- env
```

#### Connection Issues

Check the service and ingress:

```bash
kubectl get service mcp-dust-server -n mcp-dust-server
kubectl get ingress mcp-dust-server -n mcp-dust-server
```

Verify network policies:

```bash
kubectl describe networkpolicy mcp-dust-server -n mcp-dust-server
```

#### Performance Issues

Check the resource usage:

```bash
kubectl top pods -n mcp-dust-server
```

Review the Prometheus metrics and Grafana dashboards for performance bottlenecks.

### Getting Help

If you encounter issues not covered in this guide, please:

1. Check the application logs for error messages
2. Review the [GitHub repository](https://github.com/your-org/mcp-dust-server) for known issues
3. Contact the development team for assistance

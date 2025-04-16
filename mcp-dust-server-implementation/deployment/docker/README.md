# MCP Dust Server Docker Deployment Guide

This guide provides detailed instructions for deploying the MCP Dust Server using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Environment Configuration](#environment-configuration)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Building Custom Images](#building-custom-images)
- [Monitoring](#monitoring)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker Engine 20.10.0 or later
- Docker Compose 2.0.0 or later
- Git (to clone the repository)

## Deployment Options

The MCP Dust Server can be deployed in two modes:

1. **Development Mode**: Includes hot reloading, debug logging, and source code mounting
2. **Production Mode**: Optimized for performance and security

## Environment Configuration

### Development Environment

Create a `.env` file in the project root:

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
MCP_SERVER_HOST=0.0.0.0
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

### Production Environment

Create a `.env.production` file in the project root:

```bash
cp .env.example .env.production
```

Edit the `.env.production` file with production-specific values.

## Development Deployment

To start the server in development mode:

```bash
docker-compose up mcp-dust-server-dev
```

This will:

1. Build the Docker image with development dependencies
2. Mount the source code for hot reloading
3. Start the server with `npm run dev`
4. Expose the server on port 5001

### Testing in Development

To run tests in the development environment:

```bash
docker-compose up test
```

## Production Deployment

To start the server in production mode:

```bash
docker-compose up -d mcp-dust-server-prod
```

This will:

1. Build the Docker image with production dependencies only
2. Start the server with optimized settings
3. Run the container in detached mode
4. Apply resource limits
5. Configure logging rotation

### Checking Logs in Production

```bash
docker-compose logs -f mcp-dust-server-prod
```

### Scaling in Production

Docker Compose doesn't support automatic scaling, but you can manually scale the service:

```bash
docker-compose up -d --scale mcp-dust-server-prod=3
```

Note: When scaling manually, you'll need to set up a load balancer in front of the containers.

## Building Custom Images

To build a custom Docker image:

```bash
docker build -t your-registry/mcp-dust-server:your-tag --build-arg NODE_ENV=production .
```

To push the image to a registry:

```bash
docker push your-registry/mcp-dust-server:your-tag
```

## Monitoring

The Docker Compose configuration includes Prometheus and Grafana for monitoring:

```bash
docker-compose up -d prometheus grafana
```

Access Grafana at http://localhost:3000 (default credentials: admin/admin).

### Available Metrics

The MCP Dust Server exposes metrics at the `/metrics` endpoint, which Prometheus scrapes. Key metrics include:

- HTTP request count and duration
- Memory and CPU usage
- Active sessions
- Error rates

## Backup and Recovery

### Creating Backups

The backup script is included in the Docker image:

```bash
docker-compose exec mcp-dust-server-prod /app/deployment/backup/backup.sh
```

### Restoring from Backup

To restore from a backup:

```bash
docker-compose exec mcp-dust-server-prod /app/deployment/backup/restore.sh /backups/mcp-dust-server/mcp-dust-server_YYYYMMDD_HHMMSS.tar.gz
```

## Troubleshooting

### Container Won't Start

Check the logs:

```bash
docker-compose logs mcp-dust-server-prod
```

Verify the environment variables:

```bash
docker-compose config
```

### Container Starts but Application Fails

Check for application errors:

```bash
docker-compose exec mcp-dust-server-prod cat /app/logs/error.log
```

### Performance Issues

Check resource usage:

```bash
docker stats
```

### Network Issues

Check if the container is exposing the correct port:

```bash
docker-compose ps
```

Verify network connectivity:

```bash
docker-compose exec mcp-dust-server-prod wget -O- http://localhost:5001/health
```

### Common Docker Compose Issues

#### Version Compatibility

Ensure your Docker Compose version is compatible with the compose file version:

```bash
docker-compose --version
```

#### File Permissions

If you encounter permission issues with mounted volumes:

```bash
sudo chown -R 1001:1001 ./logs
```

#### Memory Limits

If the container is being killed due to memory limits:

```bash
docker-compose up -d --scale mcp-dust-server-prod=1 --memory=2g mcp-dust-server-prod
```

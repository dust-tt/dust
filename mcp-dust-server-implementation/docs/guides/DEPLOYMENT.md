# MCP Dust Server Deployment Guide

This guide provides detailed instructions for deploying the MCP Dust Server in various environments, from development to production.

## Table of Contents

- [Deployment Options](#deployment-options)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Environment Configuration](#environment-configuration)
- [Scaling Considerations](#scaling-considerations)
- [Monitoring and Logging](#monitoring-and-logging)
- [Backup and Recovery](#backup-and-recovery)
- [Security Considerations](#security-considerations)
- [Continuous Integration and Deployment](#continuous-integration-and-deployment)

## Deployment Options

The MCP Dust Server can be deployed in several ways:

1. **Docker**: Containerized deployment using Docker and Docker Compose
2. **Kubernetes**: Orchestrated deployment using Kubernetes
3. **Node.js**: Direct deployment on a Node.js server

Choose the deployment option that best fits your infrastructure and requirements.

## Docker Deployment

### Prerequisites

- Docker Engine 20.10.0 or later
- Docker Compose 2.0.0 or later
- Access to a Docker registry (optional)

### Building the Docker Image

To build the Docker image:

```bash
docker build -t mcp-dust-server:latest .
```

To build for a specific environment:

```bash
docker build -t mcp-dust-server:latest --build-arg NODE_ENV=production .
```

### Running with Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mcp-dust-server:
    image: mcp-dust-server:latest
    ports:
      - "5001:5001"
    env_file:
      - .env.production
    restart: always
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Start the server:

```bash
docker-compose up -d
```

### Docker Deployment with Monitoring

For a more comprehensive deployment with monitoring:

```yaml
version: '3.8'

services:
  mcp-dust-server:
    image: mcp-dust-server:latest
    ports:
      - "5001:5001"
    env_file:
      - .env.production
    restart: always
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:5001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - mcp-network

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./deployment/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    ports:
      - "9090:9090"
    restart: unless-stopped
    networks:
      - mcp-network

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
      - ./deployment/grafana/provisioning:/etc/grafana/provisioning
      - ./deployment/grafana/dashboards:/var/lib/grafana/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
    ports:
      - "3000:3000"
    depends_on:
      - prometheus
    restart: unless-stopped
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge

volumes:
  prometheus_data:
  grafana_data:
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster 1.19+
- kubectl configured to access your cluster
- Helm (optional, for chart-based deployment)

### Deployment Files

The MCP Dust Server includes Kubernetes deployment files in the `deployment/kubernetes` directory:

- `namespace.yaml`: Kubernetes namespace
- `configmap.yaml`: ConfigMap for non-sensitive configuration
- `secret.yaml`: Secret for sensitive configuration
- `deployment.yaml`: Deployment configuration
- `service.yaml`: Service configuration
- `ingress.yaml`: Ingress configuration
- `hpa.yaml`: Horizontal Pod Autoscaler configuration
- `pdb.yaml`: Pod Disruption Budget configuration
- `network-policy.yaml`: Network Policy configuration

### Deploying to Kubernetes

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

## Environment Configuration

### Production Environment Variables

For production deployments, we recommend the following environment variables:

```env
# MCP Server Configuration
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=5001

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json
LOG_REQUEST_BODY=false
LOG_REQUEST_HEADERS=false
LOG_RESPONSE_BODY=false
LOG_RESPONSE_HEADERS=false

# Security Configuration
CORS_ALLOWED_ORIGINS=https://your-production-domain.com
ENABLE_RATE_LIMIT=true
RATE_LIMIT_WINDOW=60
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_CSRF=true
ENABLE_HELMET=true

# Metrics Configuration
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
```

See the [Configuration Guide](CONFIGURATION.md) for more details.

## Scaling Considerations

### Horizontal Scaling

The MCP Dust Server is designed to be horizontally scalable. You can run multiple instances behind a load balancer to handle increased load.

For Kubernetes deployments, use the Horizontal Pod Autoscaler:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-dust-server
  namespace: mcp-dust-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-dust-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Vertical Scaling

For vertical scaling, adjust the resource limits in your deployment configuration:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

## Monitoring and Logging

### Prometheus Metrics

The MCP Dust Server exposes Prometheus metrics at the `/metrics` endpoint. Configure Prometheus to scrape this endpoint:

```yaml
scrape_configs:
  - job_name: 'mcp-dust-server'
    metrics_path: /metrics
    scrape_interval: 10s
    static_configs:
      - targets: ['mcp-dust-server:5001']
```

### Grafana Dashboards

The MCP Dust Server includes Grafana dashboards in the `deployment/grafana/dashboards` directory. Import these dashboards into your Grafana instance.

### Logging

Configure logging using the following environment variables:

```env
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/mcp-dust-server/server.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10
```

For Kubernetes deployments, use a logging solution like Fluentd, Logstash, or the ELK stack.

## Backup and Recovery

### Backup Strategy

The MCP Dust Server uses an automated backup system that performs the following:

1. Daily backups of environment files and logs
2. Daily backups of Prometheus and Grafana data (if applicable)
3. Retention of backups for 30 days

Backups are stored in the `/backups/mcp-dust-server` directory and are named with a timestamp.

### Manual Backups

Manual backups can be performed using the `backup.sh` script:

```bash
./deployment/backup/backup.sh
```

### Recovery Procedures

To restore from a backup:

```bash
./deployment/backup/restore.sh /backups/mcp-dust-server/mcp-dust-server_YYYYMMDD_HHMMSS.tar.gz
```

For more details, see the [Disaster Recovery Plan](../deployment/backup/DISASTER_RECOVERY.md).

## Security Considerations

### Network Security

- Use HTTPS for all communications
- Configure network policies to restrict access
- Use a Web Application Firewall (WAF) for additional protection

### Authentication and Authorization

- Use strong, random values for `SECURITY_SECRET_KEY`
- Enable rate limiting to prevent brute force attacks
- Enable CSRF protection for web interfaces

### Container Security

- Use the latest base images
- Run containers as non-root users
- Scan images for vulnerabilities

## Continuous Integration and Deployment

### GitHub Actions

The MCP Dust Server includes GitHub Actions workflows in the `.github/workflows` directory:

- `ci.yml`: Continuous Integration workflow
- `release.yml`: Release workflow

### CI/CD Pipeline

The CI/CD pipeline includes the following steps:

1. **Lint**: Check code quality
2. **Test**: Run unit and integration tests
3. **Build**: Build the application
4. **Docker**: Build and push Docker images
5. **Deploy**: Deploy to development or production environments

### Deployment Environments

The CI/CD pipeline supports the following environments:

- **Development**: Deployed from the `develop` branch
- **Production**: Deployed from the `main` branch or releases

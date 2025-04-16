# MCP Dust Server Kubernetes Deployment Guide

This guide provides detailed instructions for deploying the MCP Dust Server on Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Architecture](#deployment-architecture)
- [Deployment Steps](#deployment-steps)
- [Configuration](#configuration)
- [Scaling](#scaling)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Kubernetes cluster (version 1.19+)
- kubectl configured to access your cluster
- Docker registry with the MCP Dust Server image
- Ingress controller (e.g., NGINX Ingress Controller)
- Cert-manager (optional, for TLS)

## Deployment Architecture

The MCP Dust Server Kubernetes deployment consists of:

- **Namespace**: Isolated environment for the application
- **ConfigMap**: Non-sensitive configuration
- **Secret**: Sensitive configuration
- **Deployment**: Application containers
- **Service**: Internal network access
- **Ingress**: External network access
- **HorizontalPodAutoscaler**: Automatic scaling
- **PodDisruptionBudget**: Availability during maintenance
- **NetworkPolicy**: Network security

## Deployment Steps

### 1. Create the Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Create Configuration

Update the secret values in `secret.yaml` with your base64-encoded values:

```bash
# Example: echo -n "your_value" | base64
```

Apply the configuration:

```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
```

### 3. Deploy the Application

Update the image reference in `deployment.yaml`:

```yaml
image: ${DOCKER_REGISTRY}/mcp-dust-server:${IMAGE_TAG}
```

Apply the deployment:

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

### 4. Set Up External Access

Update the host in `ingress.yaml`:

```yaml
host: ${MCP_SERVER_DOMAIN}
```

Apply the ingress:

```bash
kubectl apply -f ingress.yaml
```

### 5. Configure Scaling and Availability

Apply the autoscaler and pod disruption budget:

```bash
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
```

### 6. Secure the Network

Apply the network policy:

```bash
kubectl apply -f network-policy.yaml
```

## Configuration

### Environment Variables

The MCP Dust Server uses the following environment variables:

#### ConfigMap Variables

- `MCP_SERVER_NAME`: Server name
- `MCP_SERVER_HOST`: Server host
- `MCP_SERVER_PORT`: Server port
- `MCP_SERVER_TIMEOUT`: Server timeout in seconds
- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `LOG_FORMAT`: Logging format (pretty, json)
- `LOG_REQUEST_BODY`: Whether to log request bodies
- `LOG_REQUEST_HEADERS`: Whether to log request headers
- `LOG_RESPONSE_BODY`: Whether to log response bodies
- `LOG_RESPONSE_HEADERS`: Whether to log response headers
- `SECURITY_TOKEN_EXPIRATION`: Token expiration in seconds
- `SESSION_TTL`: Session time-to-live in milliseconds
- `ENABLE_METRICS`: Whether to enable metrics
- `METRICS_PREFIX`: Metrics prefix

#### Secret Variables

- `DUST_API_KEY`: Dust API key
- `DUST_WORKSPACE_ID`: Dust workspace ID
- `DUST_AGENT_ID`: Dust agent ID
- `DUST_USERNAME`: Dust username
- `DUST_EMAIL`: Dust email
- `DUST_FULL_NAME`: Dust full name
- `DUST_TIMEZONE`: Dust timezone
- `CORS_ALLOWED_ORIGINS`: CORS allowed origins
- `SECURITY_SECRET_KEY`: Security secret key

### Resource Limits

The deployment includes resource requests and limits:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

Adjust these values based on your application's requirements.

## Scaling

### Automatic Scaling

The HorizontalPodAutoscaler automatically scales the deployment based on CPU and memory utilization:

```yaml
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

### Manual Scaling

To manually scale the deployment:

```bash
kubectl scale deployment mcp-dust-server -n mcp-dust-server --replicas=5
```

## Monitoring

### Health Checks

The deployment includes liveness and readiness probes:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /ready
    port: 5001
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Prometheus Metrics

The service and pods are annotated for Prometheus scraping:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "5001"
  prometheus.io/path: "/metrics"
```

## Troubleshooting

### Checking Deployment Status

```bash
kubectl get deployment mcp-dust-server -n mcp-dust-server
```

### Viewing Pods

```bash
kubectl get pods -n mcp-dust-server -l app=mcp-dust-server
```

### Checking Logs

```bash
kubectl logs -n mcp-dust-server -l app=mcp-dust-server
```

### Debugging a Specific Pod

```bash
kubectl describe pod -n mcp-dust-server <pod-name>
```

### Checking Events

```bash
kubectl get events -n mcp-dust-server
```

### Accessing a Pod Shell

```bash
kubectl exec -it -n mcp-dust-server <pod-name> -- /bin/sh
```

### Common Issues

#### Pod Stuck in Pending State

Check for resource constraints:

```bash
kubectl describe pod -n mcp-dust-server <pod-name>
```

#### Pod Crashing

Check the logs:

```bash
kubectl logs -n mcp-dust-server <pod-name>
```

#### Service Unavailable

Check the service and endpoints:

```bash
kubectl get service mcp-dust-server -n mcp-dust-server
kubectl get endpoints mcp-dust-server -n mcp-dust-server
```

#### Ingress Not Working

Check the ingress and ingress controller:

```bash
kubectl get ingress mcp-dust-server -n mcp-dust-server
kubectl get pods -n ingress-nginx
```

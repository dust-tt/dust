# MCP Dust Server Monitoring Guide

This guide explains how to monitor the MCP Dust Server using Prometheus and Grafana, and how to set up alerts for critical issues.

## Table of Contents

- [Monitoring Overview](#monitoring-overview)
- [Metrics Collection](#metrics-collection)
- [Prometheus Configuration](#prometheus-configuration)
- [Grafana Dashboards](#grafana-dashboards)
- [Health Checks](#health-checks)
- [Alerting](#alerting)
- [Log Monitoring](#log-monitoring)
- [Performance Monitoring](#performance-monitoring)

## Monitoring Overview

The MCP Dust Server includes built-in monitoring capabilities:

1. **Prometheus Metrics**: Exposes metrics at the `/metrics` endpoint
2. **Health Checks**: Provides health check endpoints at `/health` and `/ready`
3. **Logging**: Configurable logging with different levels and formats
4. **Grafana Dashboards**: Pre-configured dashboards for visualization

These capabilities allow you to monitor the health, performance, and usage of the MCP Dust Server.

## Metrics Collection

### Available Metrics

The MCP Dust Server exposes the following metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `mcp_dust_server_http_requests_total` | Counter | Total number of HTTP requests |
| `mcp_dust_server_http_request_duration_seconds` | Histogram | HTTP request duration |
| `mcp_dust_server_http_request_size_bytes` | Histogram | HTTP request size |
| `mcp_dust_server_http_response_size_bytes` | Histogram | HTTP response size |
| `mcp_dust_server_active_sessions` | Gauge | Number of active MCP sessions |
| `mcp_dust_server_session_duration_seconds` | Histogram | MCP session duration |
| `mcp_dust_server_dust_api_requests_total` | Counter | Total number of Dust API requests |
| `mcp_dust_server_dust_api_request_duration_seconds` | Histogram | Dust API request duration |
| `mcp_dust_server_dust_api_errors_total` | Counter | Total number of Dust API errors |
| `mcp_dust_server_memory_usage_bytes` | Gauge | Memory usage |
| `mcp_dust_server_cpu_usage_percent` | Gauge | CPU usage |

### Enabling Metrics

Metrics are enabled by default. You can configure them using the following environment variables:

```env
ENABLE_METRICS=true
METRICS_PREFIX=mcp_dust_server
METRICS_PATH=/metrics
```

## Prometheus Configuration

### Basic Configuration

Create a `prometheus.yml` file:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          # - alertmanager:9093

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'mcp-dust-server'
    metrics_path: /metrics
    scrape_interval: 10s
    static_configs:
      - targets: ['mcp-dust-server:5001']
```

### Docker Compose Configuration

Add Prometheus to your Docker Compose configuration:

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.path=/prometheus'
    - '--web.console.libraries=/usr/share/prometheus/console_libraries'
    - '--web.console.templates=/usr/share/prometheus/consoles'
  ports:
    - "9090:9090"
  restart: unless-stopped
```

### Kubernetes Configuration

Create a Prometheus deployment in Kubernetes:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
      scrape_timeout: 10s

    scrape_configs:
      - job_name: 'mcp-dust-server'
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - source_labels: [__meta_kubernetes_namespace]
            action: replace
            target_label: kubernetes_namespace
          - source_labels: [__meta_kubernetes_pod_name]
            action: replace
            target_label: kubernetes_pod_name
```

## Grafana Dashboards

### Basic Dashboard

The MCP Dust Server includes a basic Grafana dashboard in the `deployment/grafana/dashboards` directory. This dashboard provides an overview of the server's health and performance.

### Custom Dashboards

You can create custom dashboards to monitor specific aspects of the MCP Dust Server. Here are some examples:

#### HTTP Request Dashboard

```json
{
  "title": "MCP Dust Server - HTTP Requests",
  "panels": [
    {
      "title": "HTTP Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "rate(mcp_dust_server_http_requests_total[5m])",
          "legendFormat": "{{method}} {{path}}"
        }
      ]
    },
    {
      "title": "HTTP Request Duration (95th percentile)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(mcp_dust_server_http_request_duration_seconds_bucket[5m])) by (le, method, path))",
          "legendFormat": "{{method}} {{path}}"
        }
      ]
    },
    {
      "title": "HTTP Error Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(mcp_dust_server_http_requests_total{status=~\"5..\"}[5m])) by (method, path)",
          "legendFormat": "{{method}} {{path}}"
        }
      ]
    }
  ]
}
```

#### MCP Session Dashboard

```json
{
  "title": "MCP Dust Server - Sessions",
  "panels": [
    {
      "title": "Active Sessions",
      "type": "graph",
      "targets": [
        {
          "expr": "mcp_dust_server_active_sessions",
          "legendFormat": "Active Sessions"
        }
      ]
    },
    {
      "title": "Session Duration (95th percentile)",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(mcp_dust_server_session_duration_seconds_bucket[5m])) by (le))",
          "legendFormat": "Session Duration"
        }
      ]
    }
  ]
}
```

## Health Checks

### Health Check Endpoints

The MCP Dust Server provides the following health check endpoints:

- `/health`: Overall health check
- `/ready`: Readiness check

### Health Check Response

The health check endpoint returns a JSON response:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2023-06-01T12:00:00Z",
  "checks": {
    "dustApi": {
      "status": "ok"
    },
    "database": {
      "status": "ok"
    }
  }
}
```

### Integrating with Monitoring Systems

You can integrate the health check endpoints with monitoring systems:

#### Kubernetes Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

#### Kubernetes Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 5001
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

## Alerting

### Prometheus Alerting Rules

Create a `alerts.yml` file:

```yaml
groups:
  - name: mcp-dust-server
    rules:
      - alert: HighErrorRate
        expr: sum(rate(mcp_dust_server_http_requests_total{status=~"5.."}[5m])) / sum(rate(mcp_dust_server_http_requests_total[5m])) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate"
          description: "Error rate is above 10% for 5 minutes"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, sum(rate(mcp_dust_server_http_request_duration_seconds_bucket[5m])) by (le)) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency"
          description: "95th percentile latency is above 1 second for 5 minutes"
      
      - alert: HighMemoryUsage
        expr: mcp_dust_server_memory_usage_bytes / 1024 / 1024 / 1024 > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is above 80% for 5 minutes"
      
      - alert: HighCPUUsage
        expr: mcp_dust_server_cpu_usage_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is above 80% for 5 minutes"
      
      - alert: TooManySessions
        expr: mcp_dust_server_active_sessions > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many sessions"
          description: "More than 100 active sessions for 5 minutes"
```

### AlertManager Configuration

Create an `alertmanager.yml` file:

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h
  receiver: 'slack'

receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX'
        channel: '#alerts'
        send_resolved: true
```

## Log Monitoring

### Log Configuration

Configure logging using the following environment variables:

```env
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=/var/log/mcp-dust-server/server.log
LOG_MAX_SIZE=100m
LOG_MAX_FILES=10
```

### Log Aggregation

For log aggregation, you can use tools like:

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Fluentd
- Loki

### Log Parsing

For JSON-formatted logs, you can parse them using tools like Logstash:

```
input {
  file {
    path => "/var/log/mcp-dust-server/server.log"
    codec => json
  }
}

filter {
  if [level] == "error" {
    mutate {
      add_tag => ["error"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "mcp-dust-server-%{+YYYY.MM.dd}"
  }
}
```

## Performance Monitoring

### Resource Usage

Monitor resource usage using the following metrics:

- `mcp_dust_server_memory_usage_bytes`: Memory usage
- `mcp_dust_server_cpu_usage_percent`: CPU usage

### Request Performance

Monitor request performance using the following metrics:

- `mcp_dust_server_http_request_duration_seconds`: HTTP request duration
- `mcp_dust_server_dust_api_request_duration_seconds`: Dust API request duration

### Session Performance

Monitor session performance using the following metrics:

- `mcp_dust_server_active_sessions`: Number of active MCP sessions
- `mcp_dust_server_session_duration_seconds`: MCP session duration

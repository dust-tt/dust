#!/bin/bash

# This script implements the monitoring and alerting system

echo "Implementing monitoring and alerting system..."

# Create directories if they don't exist
mkdir -p cloudformation
mkdir -p scripts
mkdir -p services/core-api/monitoring
mkdir -p services/mcp-server/monitoring
mkdir -p services/frontend/monitoring

# Deploy CloudWatch alarms
echo "Deploying CloudWatch alarms..."
aws cloudformation deploy \
  --template-file cloudformation/monitoring-alarms.yaml \
  --stack-name monitoring-alarms \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=dev \
    CoreApiServiceName=dust-core-api \
    FrontendServiceName=dust-frontend \
    MCPServerServiceName=dust-mcp-server \
    ClusterName=dust-dev \
    DatabaseIdentifier=dust-db \
    ElastiCacheClusterId=dust-cache \
    OpenSearchDomainName=dust-search \
    LoadBalancerName=dust-alb \
    NotificationEmail=alerts@example.com

# Deploy CloudWatch dashboards
echo "Deploying CloudWatch dashboards..."
aws cloudformation deploy \
  --template-file cloudformation/monitoring-dashboards.yaml \
  --stack-name monitoring-dashboards \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=dev \
    CoreApiServiceName=dust-core-api \
    FrontendServiceName=dust-frontend \
    MCPServerServiceName=dust-mcp-server \
    ClusterName=dust-dev \
    DatabaseIdentifier=dust-db \
    ElastiCacheClusterId=dust-cache \
    OpenSearchDomainName=dust-search \
    LoadBalancerName=dust-alb

# Create S3 bucket for synthetic monitoring artifacts
echo "Creating S3 bucket for synthetic monitoring artifacts..."
aws s3api create-bucket \
  --bucket dust-monitoring-${AWS_ACCOUNT_ID} \
  --region ${AWS_REGION} \
  --create-bucket-configuration LocationConstraint=${AWS_REGION}

# Deploy synthetic monitoring
echo "Deploying synthetic monitoring..."
aws cloudformation deploy \
  --template-file cloudformation/synthetic-monitoring.yaml \
  --stack-name synthetic-monitoring \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=dev \
    FrontendURL=https://example.com \
    CoreApiURL=https://api.example.com \
    MCPServerURL=https://mcp.example.com \
    NotificationEmail=alerts@example.com

# Install monitoring dependencies for Core API
echo "Installing monitoring dependencies for Core API..."
cd services/core-api
npm install --save winston winston-cloudwatch prom-client express

# Install monitoring dependencies for MCP Server
echo "Installing monitoring dependencies for MCP Server..."
cd ../mcp-server
npm install --save winston winston-cloudwatch prom-client express

# Install monitoring dependencies for Frontend
echo "Installing monitoring dependencies for Frontend..."
cd ../frontend
npm install --save aws-rum-web

# Return to root directory
cd ../../

# Update Core API to use monitoring
echo "Updating Core API to use monitoring..."
cd services/core-api

# Update app.js to use monitoring
if [ -f app.js ]; then
  # Check if monitoring is already added
  if ! grep -q "require('./monitoring/prometheus-config')" app.js; then
    # Add monitoring to the file
    sed -i '/const express/a const { metricsMiddleware, metricsRouter } = require(\'./monitoring/prometheus-config\');' app.js
    sed -i '/const express/a const { httpLoggerMiddleware, errorLoggerMiddleware } = require(\'./monitoring/logging-config\');' app.js
    sed -i '/app.use(express.json())/a app.use(httpLoggerMiddleware);' app.js
    sed -i '/app.use(httpLoggerMiddleware)/a app.use(metricsMiddleware);' app.js
    sed -i '/app.use(metricsMiddleware)/a app.use(\'/monitoring\', metricsRouter);' app.js
    
    # Add error logger middleware at the end
    sed -i '/app.listen/i app.use(errorLoggerMiddleware);' app.js
  fi
fi

# Return to root directory
cd ../../

# Update MCP Server to use monitoring
echo "Updating MCP Server to use monitoring..."
cd services/mcp-server

# Update app.js to use monitoring
if [ -f app.js ]; then
  # Check if monitoring is already added
  if ! grep -q "require('./monitoring/prometheus-config')" app.js; then
    # Add monitoring to the file
    sed -i '/const express/a const { metricsMiddleware, metricsRouter } = require(\'./monitoring/prometheus-config\');' app.js
    sed -i '/const express/a const { httpLoggerMiddleware, errorLoggerMiddleware } = require(\'./monitoring/logging-config\');' app.js
    sed -i '/app.use(express.json())/a app.use(httpLoggerMiddleware);' app.js
    sed -i '/app.use(httpLoggerMiddleware)/a app.use(metricsMiddleware);' app.js
    sed -i '/app.use(metricsMiddleware)/a app.use(\'/monitoring\', metricsRouter);' app.js
    
    # Add error logger middleware at the end
    sed -i '/app.listen/i app.use(errorLoggerMiddleware);' app.js
  fi
fi

# Return to root directory
cd ../../

# Update Frontend to use monitoring
echo "Updating Frontend to use monitoring..."
cd services/frontend

# Update index.js to use monitoring
if [ -f src/index.js ]; then
  # Check if monitoring is already added
  if ! grep -q "import { awsRum, performanceMetrics, userJourney, errorTracking } from './monitoring/rum-config'" src/index.js; then
    # Add monitoring to the file
    sed -i '1i import { awsRum, performanceMetrics, userJourney, errorTracking } from \'./monitoring/rum-config\';' src/index.js
    
    # Initialize monitoring
    sed -i '/ReactDOM.render/i // Initialize monitoring\nawsRum.init({\n  applicationId: \'your-application-id\',\n  region: \'us-east-1\',\n  identityPoolId: \'your-identity-pool-id\',\n  endpoint: \'https://dataplane.rum.us-east-1.amazonaws.com\',\n  allowCookies: true\n});\n\nperformanceMetrics.initAll();\nerrorTracking.init();' src/index.js
  fi
fi

# Return to root directory
cd ../../

# Create Prometheus configuration
echo "Creating Prometheus configuration..."
cat > prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'core-api'
    metrics_path: '/monitoring/metrics'
    static_configs:
      - targets: ['core-api:3000']

  - job_name: 'mcp-server'
    metrics_path: '/monitoring/metrics'
    static_configs:
      - targets: ['mcp-server:3005']
EOF

# Create Grafana configuration
echo "Creating Grafana configuration..."
mkdir -p grafana/provisioning/datasources
mkdir -p grafana/provisioning/dashboards

# Create Grafana datasource configuration
cat > grafana/provisioning/datasources/datasource.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# Create Grafana dashboard configuration
cat > grafana/provisioning/dashboards/dashboard.yml << 'EOF'
apiVersion: 1

providers:
  - name: 'Default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    options:
      path: /var/lib/grafana/dashboards
EOF

# Create Docker Compose file for local monitoring
echo "Creating Docker Compose file for local monitoring..."
cat > docker-compose-monitoring.yml << 'EOF'
version: '3'

services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus:/etc/prometheus
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    restart: always

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    restart: always
    depends_on:
      - prometheus

volumes:
  prometheus_data:
  grafana_data:
EOF

echo "Monitoring and alerting system implementation completed!"
chmod +x scripts/implement-monitoring.sh

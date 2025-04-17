#!/bin/bash

# This script verifies the monitoring and alerting system

echo "Verifying monitoring and alerting system..."

# Check CloudWatch alarms
echo "Checking CloudWatch alarms..."
ALARMS=$(aws cloudwatch describe-alarms --alarm-name-prefix dust --query "MetricAlarms[].AlarmName" --output text)
if [ -n "$ALARMS" ]; then
  echo "✅ CloudWatch alarms are configured"
  echo "Alarms: $ALARMS"
else
  echo "❌ CloudWatch alarms are not configured"
fi

# Check CloudWatch dashboards
echo "Checking CloudWatch dashboards..."
DASHBOARDS=$(aws cloudwatch list-dashboards --dashboard-name-prefix dust --query "DashboardEntries[].DashboardName" --output text)
if [ -n "$DASHBOARDS" ]; then
  echo "✅ CloudWatch dashboards are configured"
  echo "Dashboards: $DASHBOARDS"
else
  echo "❌ CloudWatch dashboards are not configured"
fi

# Check synthetic canaries
echo "Checking synthetic canaries..."
CANARIES=$(aws synthetics describe-canaries --query "Canaries[].Name" --output text)
if [ -n "$CANARIES" ]; then
  echo "✅ Synthetic canaries are configured"
  echo "Canaries: $CANARIES"
else
  echo "❌ Synthetic canaries are not configured"
fi

# Check SNS topics
echo "Checking SNS topics..."
TOPICS=$(aws sns list-topics --query "Topics[?contains(TopicArn, 'dust')].TopicArn" --output text)
if [ -n "$TOPICS" ]; then
  echo "✅ SNS topics are configured"
  echo "Topics: $TOPICS"
else
  echo "❌ SNS topics are not configured"
fi

# Check SNS subscriptions
echo "Checking SNS subscriptions..."
for TOPIC in $TOPICS; do
  SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic --topic-arn $TOPIC --query "Subscriptions[].Endpoint" --output text)
  if [ -n "$SUBSCRIPTIONS" ]; then
    echo "✅ SNS subscriptions are configured for topic $TOPIC"
    echo "Subscriptions: $SUBSCRIPTIONS"
  else
    echo "❌ SNS subscriptions are not configured for topic $TOPIC"
  fi
done

# Check Core API monitoring
echo "Checking Core API monitoring..."
if [ -f services/core-api/monitoring/prometheus-config.js ] && [ -f services/core-api/monitoring/logging-config.js ]; then
  echo "✅ Core API monitoring files are present"
else
  echo "❌ Core API monitoring files are missing"
fi

# Check MCP Server monitoring
echo "Checking MCP Server monitoring..."
if [ -f services/mcp-server/monitoring/prometheus-config.js ] && [ -f services/mcp-server/monitoring/logging-config.js ]; then
  echo "✅ MCP Server monitoring files are present"
else
  echo "❌ MCP Server monitoring files are missing"
fi

# Check Frontend monitoring
echo "Checking Frontend monitoring..."
if [ -f services/frontend/monitoring/rum-config.js ]; then
  echo "✅ Frontend monitoring files are present"
else
  echo "❌ Frontend monitoring files are missing"
fi

# Check Prometheus configuration
echo "Checking Prometheus configuration..."
if [ -f prometheus/prometheus.yml ]; then
  echo "✅ Prometheus configuration is present"
else
  echo "❌ Prometheus configuration is missing"
fi

# Check Grafana configuration
echo "Checking Grafana configuration..."
if [ -f grafana/provisioning/datasources/datasource.yml ] && [ -f grafana/provisioning/dashboards/dashboard.yml ]; then
  echo "✅ Grafana configuration is present"
else
  echo "❌ Grafana configuration is missing"
fi

# Check Docker Compose file
echo "Checking Docker Compose file..."
if [ -f docker-compose-monitoring.yml ]; then
  echo "✅ Docker Compose file is present"
else
  echo "❌ Docker Compose file is missing"
fi

echo "Monitoring and alerting system verification completed!"
chmod +x scripts/verify-monitoring.sh

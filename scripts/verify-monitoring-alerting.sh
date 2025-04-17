#!/bin/bash

# This script verifies the monitoring and alerting system

echo "Verifying monitoring and alerting system..."

# Set variables
ENVIRONMENT=${1:-dev}

# Check CloudFormation stacks
echo "Checking CloudFormation stacks..."
if aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Monitoring and alerting part 1 CloudFormation stack exists"
else
  echo "❌ Monitoring and alerting part 1 CloudFormation stack does not exist"
fi

if aws cloudformation describe-stacks --stack-name monitoring-alerting-part2-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Monitoring and alerting part 2 CloudFormation stack exists"
else
  echo "❌ Monitoring and alerting part 2 CloudFormation stack does not exist"
fi

if aws cloudformation describe-stacks --stack-name monitoring-alerting-part3-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Monitoring and alerting part 3 CloudFormation stack exists"
else
  echo "❌ Monitoring and alerting part 3 CloudFormation stack does not exist"
fi

# Check SNS topics
echo "Checking SNS topics..."
CRITICAL_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='CriticalAlertsTopic'].OutputValue" --output text 2>/dev/null || echo "")
WARNING_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='WarningAlertsTopic'].OutputValue" --output text 2>/dev/null || echo "")
INFO_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='InfoAlertsTopic'].OutputValue" --output text 2>/dev/null || echo "")
SECURITY_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='SecurityAlertsTopic'].OutputValue" --output text 2>/dev/null || echo "")
COST_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='CostAlertsTopic'].OutputValue" --output text 2>/dev/null || echo "")

if [ -n "$CRITICAL_ALERTS_TOPIC_ARN" ]; then
  echo "✅ Critical alerts SNS topic exists"
  
  # Check subscriptions
  SUBSCRIPTIONS=$(aws sns list-subscriptions-by-topic --topic-arn $CRITICAL_ALERTS_TOPIC_ARN --query "Subscriptions[*].Protocol" --output text 2>/dev/null || echo "")
  
  if [[ $SUBSCRIPTIONS == *"email"* ]]; then
    echo "  ✅ Email subscription exists"
  else
    echo "  ❌ Email subscription does not exist"
  fi
  
  if [[ $SUBSCRIPTIONS == *"lambda"* ]]; then
    echo "  ✅ Lambda subscription exists (for Slack or PagerDuty)"
  else
    echo "  ❌ Lambda subscription does not exist (for Slack or PagerDuty)"
  fi
else
  echo "❌ Critical alerts SNS topic does not exist"
fi

if [ -n "$WARNING_ALERTS_TOPIC_ARN" ]; then
  echo "✅ Warning alerts SNS topic exists"
else
  echo "❌ Warning alerts SNS topic does not exist"
fi

if [ -n "$INFO_ALERTS_TOPIC_ARN" ]; then
  echo "✅ Info alerts SNS topic exists"
else
  echo "❌ Info alerts SNS topic does not exist"
fi

if [ -n "$SECURITY_ALERTS_TOPIC_ARN" ]; then
  echo "✅ Security alerts SNS topic exists"
else
  echo "❌ Security alerts SNS topic does not exist"
fi

if [ -n "$COST_ALERTS_TOPIC_ARN" ]; then
  echo "✅ Cost alerts SNS topic exists"
else
  echo "❌ Cost alerts SNS topic does not exist"
fi

# Check CloudWatch dashboards
echo "Checking CloudWatch dashboards..."
EXECUTIVE_DASHBOARD=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='ExecutiveDashboard'].OutputValue" --output text 2>/dev/null || echo "")
OPERATIONS_DASHBOARD=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='OperationsDashboard'].OutputValue" --output text 2>/dev/null || echo "")

if [ -n "$EXECUTIVE_DASHBOARD" ]; then
  echo "✅ Executive dashboard exists"
else
  echo "❌ Executive dashboard does not exist"
fi

if [ -n "$OPERATIONS_DASHBOARD" ]; then
  echo "✅ Operations dashboard exists"
else
  echo "❌ Operations dashboard does not exist"
fi

# Check CloudWatch alarms
echo "Checking CloudWatch alarms..."
CORE_API_CPU_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-core-api-cpu-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
CORE_API_MEMORY_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-core-api-memory-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
MCP_SERVER_CPU_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-mcp-server-cpu-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
MCP_SERVER_MEMORY_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-mcp-server-memory-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
FRONTEND_CPU_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-frontend-cpu-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
FRONTEND_MEMORY_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-frontend-memory-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
ALB_5XX_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-alb-5xx-error-rate-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
ALB_RESPONSE_TIME_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-alb-target-response-time-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
RDS_CPU_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-rds-cpu-utilization-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
RDS_STORAGE_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-rds-free-storage-space-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")
RDS_CONNECTIONS_ALARM=$(aws cloudwatch describe-alarms --alarm-names dust-rds-database-connections-warning-${ENVIRONMENT} --query "MetricAlarms[0].AlarmName" --output text 2>/dev/null || echo "")

if [ -n "$CORE_API_CPU_ALARM" ]; then
  echo "✅ Core API CPU utilization alarm exists"
else
  echo "❌ Core API CPU utilization alarm does not exist"
fi

if [ -n "$CORE_API_MEMORY_ALARM" ]; then
  echo "✅ Core API memory utilization alarm exists"
else
  echo "❌ Core API memory utilization alarm does not exist"
fi

if [ -n "$MCP_SERVER_CPU_ALARM" ]; then
  echo "✅ MCP Server CPU utilization alarm exists"
else
  echo "❌ MCP Server CPU utilization alarm does not exist"
fi

if [ -n "$MCP_SERVER_MEMORY_ALARM" ]; then
  echo "✅ MCP Server memory utilization alarm exists"
else
  echo "❌ MCP Server memory utilization alarm does not exist"
fi

if [ -n "$FRONTEND_CPU_ALARM" ]; then
  echo "✅ Frontend CPU utilization alarm exists"
else
  echo "❌ Frontend CPU utilization alarm does not exist"
fi

if [ -n "$FRONTEND_MEMORY_ALARM" ]; then
  echo "✅ Frontend memory utilization alarm exists"
else
  echo "❌ Frontend memory utilization alarm does not exist"
fi

if [ -n "$ALB_5XX_ALARM" ]; then
  echo "✅ ALB 5XX error rate alarm exists"
else
  echo "❌ ALB 5XX error rate alarm does not exist"
fi

if [ -n "$ALB_RESPONSE_TIME_ALARM" ]; then
  echo "✅ ALB target response time alarm exists"
else
  echo "❌ ALB target response time alarm does not exist"
fi

if [ -n "$RDS_CPU_ALARM" ]; then
  echo "✅ RDS CPU utilization alarm exists"
else
  echo "❌ RDS CPU utilization alarm does not exist"
fi

if [ -n "$RDS_STORAGE_ALARM" ]; then
  echo "✅ RDS free storage space alarm exists"
else
  echo "❌ RDS free storage space alarm does not exist"
fi

if [ -n "$RDS_CONNECTIONS_ALARM" ]; then
  echo "✅ RDS database connections alarm exists"
else
  echo "❌ RDS database connections alarm does not exist"
fi

# Check CloudWatch Synthetics canaries
echo "Checking CloudWatch Synthetics canaries..."
API_HEALTH_CHECK_CANARY=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-api-health-check-${ENVIRONMENT}'].Name" --output text 2>/dev/null || echo "")
WEBAPP_HEALTH_CHECK_CANARY=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-webapp-health-check-${ENVIRONMENT}'].Name" --output text 2>/dev/null || echo "")
MCP_SERVER_HEALTH_CHECK_CANARY=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-mcp-server-health-check-${ENVIRONMENT}'].Name" --output text 2>/dev/null || echo "")

if [ -n "$API_HEALTH_CHECK_CANARY" ]; then
  echo "✅ API health check canary exists"
  
  # Check canary status
  CANARY_STATUS=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-api-health-check-${ENVIRONMENT}'].Status.State" --output text 2>/dev/null || echo "")
  
  if [ "$CANARY_STATUS" == "RUNNING" ]; then
    echo "  ✅ API health check canary is running"
  else
    echo "  ❌ API health check canary is not running (status: $CANARY_STATUS)"
  fi
else
  echo "❌ API health check canary does not exist"
fi

if [ -n "$WEBAPP_HEALTH_CHECK_CANARY" ]; then
  echo "✅ Web app health check canary exists"
  
  # Check canary status
  CANARY_STATUS=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-webapp-health-check-${ENVIRONMENT}'].Status.State" --output text 2>/dev/null || echo "")
  
  if [ "$CANARY_STATUS" == "RUNNING" ]; then
    echo "  ✅ Web app health check canary is running"
  else
    echo "  ❌ Web app health check canary is not running (status: $CANARY_STATUS)"
  fi
else
  echo "❌ Web app health check canary does not exist"
fi

if [ -n "$MCP_SERVER_HEALTH_CHECK_CANARY" ]; then
  echo "✅ MCP server health check canary exists"
  
  # Check canary status
  CANARY_STATUS=$(aws synthetics describe-canaries --query "Canaries[?Name=='dust-mcp-server-health-check-${ENVIRONMENT}'].Status.State" --output text 2>/dev/null || echo "")
  
  if [ "$CANARY_STATUS" == "RUNNING" ]; then
    echo "  ✅ MCP server health check canary is running"
  else
    echo "  ❌ MCP server health check canary is not running (status: $CANARY_STATUS)"
  fi
else
  echo "❌ MCP server health check canary does not exist"
fi

# Check CloudWatch log groups
echo "Checking CloudWatch log groups..."
CORE_API_LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix /ecs/dust-core-api-${ENVIRONMENT} --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "")
MCP_SERVER_LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix /ecs/dust-mcp-server-${ENVIRONMENT} --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "")
FRONTEND_LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix /ecs/dust-frontend-${ENVIRONMENT} --query "logGroups[0].logGroupName" --output text 2>/dev/null || echo "")

if [ -n "$CORE_API_LOG_GROUP" ]; then
  echo "✅ Core API log group exists"
else
  echo "❌ Core API log group does not exist"
fi

if [ -n "$MCP_SERVER_LOG_GROUP" ]; then
  echo "✅ MCP server log group exists"
else
  echo "❌ MCP server log group does not exist"
fi

if [ -n "$FRONTEND_LOG_GROUP" ]; then
  echo "✅ Frontend log group exists"
else
  echo "❌ Frontend log group does not exist"
fi

# Check CloudWatch log metric filters
echo "Checking CloudWatch log metric filters..."
CORE_API_ERROR_METRIC_FILTER=$(aws logs describe-metric-filters --log-group-name /ecs/dust-core-api-${ENVIRONMENT} --query "metricFilters[?filterPattern=='\{ $.level = \"error\" \}'].filterName" --output text 2>/dev/null || echo "")
MCP_SERVER_ERROR_METRIC_FILTER=$(aws logs describe-metric-filters --log-group-name /ecs/dust-mcp-server-${ENVIRONMENT} --query "metricFilters[?filterPattern=='\{ $.level = \"error\" \}'].filterName" --output text 2>/dev/null || echo "")
FRONTEND_ERROR_METRIC_FILTER=$(aws logs describe-metric-filters --log-group-name /ecs/dust-frontend-${ENVIRONMENT} --query "metricFilters[?filterPattern=='\{ $.level = \"error\" \}'].filterName" --output text 2>/dev/null || echo "")

if [ -n "$CORE_API_ERROR_METRIC_FILTER" ]; then
  echo "✅ Core API error metric filter exists"
else
  echo "❌ Core API error metric filter does not exist"
fi

if [ -n "$MCP_SERVER_ERROR_METRIC_FILTER" ]; then
  echo "✅ MCP server error metric filter exists"
else
  echo "❌ MCP server error metric filter does not exist"
fi

if [ -n "$FRONTEND_ERROR_METRIC_FILTER" ]; then
  echo "✅ Frontend error metric filter exists"
else
  echo "❌ Frontend error metric filter does not exist"
fi

# Check S3 bucket for monitoring artifacts
echo "Checking S3 bucket for monitoring artifacts..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
BUCKET_NAME="dust-monitoring-${ENVIRONMENT}-${ACCOUNT_ID}"

if aws s3api head-bucket --bucket $BUCKET_NAME 2>/dev/null; then
  echo "✅ Monitoring artifacts S3 bucket exists"
  
  # Check bucket encryption
  ENCRYPTION=$(aws s3api get-bucket-encryption --bucket $BUCKET_NAME --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" --output text 2>/dev/null || echo "")
  
  if [ -n "$ENCRYPTION" ]; then
    echo "  ✅ Bucket encryption is enabled"
  else
    echo "  ❌ Bucket encryption is not enabled"
  fi
  
  # Check public access block
  PUBLIC_ACCESS_BLOCK=$(aws s3api get-public-access-block --bucket $BUCKET_NAME --query "PublicAccessBlockConfiguration" --output text 2>/dev/null || echo "")
  
  if [ -n "$PUBLIC_ACCESS_BLOCK" ]; then
    echo "  ✅ Public access block is configured"
  else
    echo "  ❌ Public access block is not configured"
  fi
else
  echo "❌ Monitoring artifacts S3 bucket does not exist"
fi

# Check runbooks
echo "Checking runbooks..."
if [ -f "runbooks/high-cpu-utilization.md" ]; then
  echo "✅ High CPU utilization runbook exists"
else
  echo "❌ High CPU utilization runbook does not exist"
fi

if [ -f "runbooks/high-memory-utilization.md" ]; then
  echo "✅ High memory utilization runbook exists"
else
  echo "❌ High memory utilization runbook does not exist"
fi

if [ -f "runbooks/api-5xx-error-rate.md" ]; then
  echo "✅ API 5XX error rate runbook exists"
else
  echo "❌ API 5XX error rate runbook does not exist"
fi

echo "Monitoring and alerting system verification completed!"
chmod +x scripts/verify-monitoring-alerting.sh

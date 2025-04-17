#!/bin/bash

# This script implements the monitoring and alerting system

echo "Implementing monitoring and alerting system..."

# Set variables
ENVIRONMENT=${1:-dev}
NOTIFICATION_EMAIL=${2:-alerts@example.com}
SLACK_WEBHOOK_URL=${3:-""}
PAGERDUTY_INTEGRATION_KEY=${4:-""}
API_ENDPOINT=${5:-"https://api.example.com"}
WEBAPP_ENDPOINT=${6:-"https://app.example.com"}
MCP_SERVER_ENDPOINT=${7:-"https://mcp.example.com"}

# Create directories if they don't exist
mkdir -p cloudformation
mkdir -p scripts
mkdir -p reports
mkdir -p runbooks

# Create S3 bucket for monitoring artifacts
echo "Creating S3 bucket for monitoring artifacts..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
BUCKET_NAME="dust-monitoring-${ENVIRONMENT}-${ACCOUNT_ID}"

if ! aws s3api head-bucket --bucket $BUCKET_NAME 2>/dev/null; then
  echo "Creating bucket: $BUCKET_NAME"
  aws s3api create-bucket \
    --bucket $BUCKET_NAME \
    --create-bucket-configuration LocationConstraint=$(aws configure get region)
  
  echo "Configuring bucket encryption..."
  aws s3api put-bucket-encryption \
    --bucket $BUCKET_NAME \
    --server-side-encryption-configuration '{"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}'
  
  echo "Configuring bucket public access block..."
  aws s3api put-public-access-block \
    --bucket $BUCKET_NAME \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
else
  echo "Bucket already exists: $BUCKET_NAME"
fi

# Deploy monitoring and alerting CloudFormation stack - Part 1
echo "Deploying monitoring and alerting CloudFormation stack - Part 1..."
aws cloudformation deploy \
  --template-file cloudformation/monitoring-alerting-part1.yaml \
  --stack-name monitoring-alerting-part1-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    NotificationEmail=${NOTIFICATION_EMAIL} \
    SlackWebhookUrl=${SLACK_WEBHOOK_URL} \
    PagerDutyIntegrationKey=${PAGERDUTY_INTEGRATION_KEY}

# Get SNS topic ARNs
CRITICAL_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='CriticalAlertsTopic'].OutputValue" --output text)
WARNING_ALERTS_TOPIC_ARN=$(aws cloudformation describe-stacks --stack-name monitoring-alerting-part1-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='WarningAlertsTopic'].OutputValue" --output text)

# Deploy monitoring and alerting CloudFormation stack - Part 2
echo "Deploying monitoring and alerting CloudFormation stack - Part 2..."
aws cloudformation deploy \
  --template-file cloudformation/monitoring-alerting-part2.yaml \
  --stack-name monitoring-alerting-part2-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    CriticalAlertsTopicArn=${CRITICAL_ALERTS_TOPIC_ARN} \
    WarningAlertsTopicArn=${WARNING_ALERTS_TOPIC_ARN}

# Deploy monitoring and alerting CloudFormation stack - Part 3
echo "Deploying monitoring and alerting CloudFormation stack - Part 3..."
aws cloudformation deploy \
  --template-file cloudformation/monitoring-alerting-part3.yaml \
  --stack-name monitoring-alerting-part3-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    CriticalAlertsTopicArn=${CRITICAL_ALERTS_TOPIC_ARN} \
    WarningAlertsTopicArn=${WARNING_ALERTS_TOPIC_ARN} \
    ApiEndpoint=${API_ENDPOINT} \
    WebAppEndpoint=${WEBAPP_ENDPOINT} \
    McpServerEndpoint=${MCP_SERVER_ENDPOINT}

# Create runbooks
echo "Creating runbooks..."

# High CPU Utilization Runbook
cat > runbooks/high-cpu-utilization.md << 'EOF'
# High CPU Utilization Runbook

## Alert Description
This alert is triggered when CPU utilization exceeds the defined threshold.

## Severity
- Warning: CPU utilization > 80% for 5 minutes
- Critical: CPU utilization > 90% for 5 minutes

## Potential Causes
1. Increased traffic or workload
2. Inefficient code or queries
3. Background processes consuming CPU
4. Memory leaks causing excessive garbage collection
5. Insufficient resources for the workload

## Investigation Steps
1. Check CloudWatch dashboard for CPU utilization trends
   ```
   aws cloudwatch get-dashboard --dashboard-name dust-operations-dashboard-${ENVIRONMENT}
   ```

2. Check other related metrics (memory, disk I/O, network)
   ```
   aws cloudwatch get-metric-data --metric-data-queries '[{"Id":"cpu","MetricStat":{"Metric":{"Namespace":"AWS/ECS","MetricName":"CPUUtilization","Dimensions":[{"Name":"ClusterName","Value":"dust-${ENVIRONMENT}"},{"Name":"ServiceName","Value":"dust-core-api-${ENVIRONMENT}"}]},"Period":60,"Stat":"Average"},"ReturnData":true}]' --start-time $(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ") --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

3. Check application logs for errors or warnings
   ```
   aws logs filter-log-events --log-group-name /ecs/dust-core-api-${ENVIRONMENT} --filter-pattern "ERROR" --start-time $(date -u -d "1 hour ago" +%s000) --end-time $(date -u +%s000)
   ```

4. Check recent deployments or changes
   ```
   aws ecs describe-services --cluster dust-${ENVIRONMENT} --services dust-core-api-${ENVIRONMENT} --query "services[0].deployments"
   ```

5. Check for unusual traffic patterns
   ```
   aws cloudwatch get-metric-data --metric-data-queries '[{"Id":"requests","MetricStat":{"Metric":{"Namespace":"AWS/ApplicationELB","MetricName":"RequestCount","Dimensions":[{"Name":"LoadBalancer","Value":"dust-alb-${ENVIRONMENT}"}]},"Period":60,"Stat":"Sum"},"ReturnData":true}]' --start-time $(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ") --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

## Resolution Steps
1. **Scale up resources** (if due to increased traffic)
   ```
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --desired-count 4
   ```

2. **Restart the service** (if due to memory leaks)
   ```
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --force-new-deployment
   ```

3. **Optimize code or queries** (if due to inefficient code)
   - Identify slow queries in logs
   - Add caching where appropriate
   - Optimize database queries
   - Review recent code changes

4. **Implement rate limiting** (if due to excessive traffic)
   - Configure rate limiting in API Gateway or ALB
   - Implement application-level rate limiting

## Prevention
1. Implement auto-scaling based on CPU utilization
2. Regularly review and optimize code and database queries
3. Implement proper caching strategies
4. Monitor and trend CPU utilization over time to identify patterns
5. Conduct load testing before major releases

## Escalation
If unable to resolve:
1. Escalate to the development team if related to application code
2. Escalate to the database team if related to database performance
3. Escalate to the infrastructure team if related to resource constraints
EOF

# High Memory Utilization Runbook
cat > runbooks/high-memory-utilization.md << 'EOF'
# High Memory Utilization Runbook

## Alert Description
This alert is triggered when memory utilization exceeds the defined threshold.

## Severity
- Warning: Memory utilization > 80% for 5 minutes
- Critical: Memory utilization > 90% for 5 minutes

## Potential Causes
1. Memory leaks in application code
2. Inefficient memory usage
3. Insufficient memory allocation
4. Large data processing operations
5. Caching too much data in memory

## Investigation Steps
1. Check CloudWatch dashboard for memory utilization trends
   ```
   aws cloudwatch get-dashboard --dashboard-name dust-operations-dashboard-${ENVIRONMENT}
   ```

2. Check other related metrics (CPU, disk I/O, network)
   ```
   aws cloudwatch get-metric-data --metric-data-queries '[{"Id":"memory","MetricStat":{"Metric":{"Namespace":"AWS/ECS","MetricName":"MemoryUtilization","Dimensions":[{"Name":"ClusterName","Value":"dust-${ENVIRONMENT}"},{"Name":"ServiceName","Value":"dust-core-api-${ENVIRONMENT}"}]},"Period":60,"Stat":"Average"},"ReturnData":true}]' --start-time $(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ") --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

3. Check application logs for memory-related errors
   ```
   aws logs filter-log-events --log-group-name /ecs/dust-core-api-${ENVIRONMENT} --filter-pattern "memory" --start-time $(date -u -d "1 hour ago" +%s000) --end-time $(date -u +%s000)
   ```

4. Check recent deployments or changes
   ```
   aws ecs describe-services --cluster dust-${ENVIRONMENT} --services dust-core-api-${ENVIRONMENT} --query "services[0].deployments"
   ```

## Resolution Steps
1. **Increase memory allocation** (short-term fix)
   ```
   # Update task definition with more memory
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --force-new-deployment
   ```

2. **Restart the service** (if due to memory leaks)
   ```
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --force-new-deployment
   ```

3. **Optimize memory usage** (long-term fix)
   - Identify memory leaks in application code
   - Optimize caching strategies
   - Implement proper garbage collection
   - Review data processing operations

## Prevention
1. Implement memory profiling in development
2. Set appropriate memory limits for containers
3. Implement auto-scaling based on memory utilization
4. Regularly review and optimize memory usage
5. Conduct load testing before major releases

## Escalation
If unable to resolve:
1. Escalate to the development team if related to application code
2. Escalate to the infrastructure team if related to resource constraints
EOF

# API 5XX Error Rate Runbook
cat > runbooks/api-5xx-error-rate.md << 'EOF'
# API 5XX Error Rate Runbook

## Alert Description
This alert is triggered when the rate of 5XX errors from the API exceeds the defined threshold.

## Severity
- Warning: 5XX error rate > 1%
- Critical: 5XX error rate > 5%

## Potential Causes
1. Application errors or exceptions
2. Database connection issues
3. Dependency service failures
4. Resource constraints (CPU, memory)
5. Invalid requests from clients
6. Recent deployment issues

## Investigation Steps
1. Check CloudWatch dashboard for error rate trends
   ```
   aws cloudwatch get-dashboard --dashboard-name dust-operations-dashboard-${ENVIRONMENT}
   ```

2. Check application logs for errors
   ```
   aws logs filter-log-events --log-group-name /ecs/dust-core-api-${ENVIRONMENT} --filter-pattern "ERROR" --start-time $(date -u -d "1 hour ago" +%s000) --end-time $(date -u +%s000)
   ```

3. Check resource utilization (CPU, memory)
   ```
   aws cloudwatch get-metric-data --metric-data-queries '[{"Id":"cpu","MetricStat":{"Metric":{"Namespace":"AWS/ECS","MetricName":"CPUUtilization","Dimensions":[{"Name":"ClusterName","Value":"dust-${ENVIRONMENT}"},{"Name":"ServiceName","Value":"dust-core-api-${ENVIRONMENT}"}]},"Period":60,"Stat":"Average"},"ReturnData":true}]' --start-time $(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ") --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

4. Check database health
   ```
   aws cloudwatch get-metric-data --metric-data-queries '[{"Id":"dbcpu","MetricStat":{"Metric":{"Namespace":"AWS/RDS","MetricName":"CPUUtilization","Dimensions":[{"Name":"DBInstanceIdentifier","Value":"dust-db-${ENVIRONMENT}"}]},"Period":60,"Stat":"Average"},"ReturnData":true}]' --start-time $(date -u -d "1 hour ago" +"%Y-%m-%dT%H:%M:%SZ") --end-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ```

5. Check recent deployments
   ```
   aws ecs describe-services --cluster dust-${ENVIRONMENT} --services dust-core-api-${ENVIRONMENT} --query "services[0].deployments"
   ```

6. Check dependency services health
   ```
   # Check RDS status
   aws rds describe-db-instances --db-instance-identifier dust-db-${ENVIRONMENT} --query "DBInstances[0].DBInstanceStatus"
   
   # Check ElastiCache status
   aws elasticache describe-cache-clusters --cache-cluster-id dust-cache-${ENVIRONMENT} --query "CacheClusters[0].CacheClusterStatus"
   ```

## Resolution Steps
1. **Rollback recent deployment** (if errors started after deployment)
   ```
   # Rollback to previous task definition
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --task-definition dust-core-api-${ENVIRONMENT}:PREVIOUS_REVISION
   ```

2. **Restart the service**
   ```
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --force-new-deployment
   ```

3. **Scale up resources** (if due to resource constraints)
   ```
   aws ecs update-service --cluster dust-${ENVIRONMENT} --service dust-core-api-${ENVIRONMENT} --desired-count 4
   ```

4. **Fix database issues** (if applicable)
   - Check database connections
   - Check database performance
   - Restart database if necessary

5. **Implement circuit breakers** (if due to dependency failures)
   - Identify failing dependencies
   - Implement circuit breakers in code
   - Implement fallback mechanisms

## Prevention
1. Implement proper error handling in code
2. Set up pre-deployment testing
3. Implement canary deployments
4. Set up database connection pooling
5. Implement circuit breakers for dependencies
6. Conduct load testing before major releases

## Escalation
If unable to resolve:
1. Escalate to the development team if related to application code
2. Escalate to the database team if related to database issues
3. Escalate to the infrastructure team if related to infrastructure issues
EOF

# Create more runbooks for other alerts...

echo "Monitoring and alerting system implementation completed!"
chmod +x scripts/implement-monitoring-alerting.sh

# Runbook: Primary Region Failure Recovery

This runbook provides step-by-step instructions for recovering from a primary region failure.

## Prerequisites

- AWS CLI installed and configured
- jq installed
- Access to AWS Management Console
- Appropriate IAM permissions

## Variables

- `PRIMARY_REGION`: The primary AWS region (e.g., us-east-1)
- `SECONDARY_REGION`: The secondary AWS region (e.g., us-west-2)
- `ENVIRONMENT`: The environment (e.g., dev, staging, prod)
- `DOMAIN_NAME`: The domain name (e.g., dust.example.com)
- `ACCOUNT_ID`: The AWS account ID

## Steps

### 1. Declare Disaster

1. **Assess the Situation**
   - Confirm that the primary region is experiencing a failure
   - Determine the scope and impact of the failure
   - Identify affected services

2. **Notify Stakeholders**
   - Notify the incident commander
   - Notify the operations team
   - Notify management
   - Update the status page

### 2. Activate Secondary Region

1. **Update Route 53 DNS Records**

```bash
# Get the health check ID
HEALTH_CHECK_ID=$(aws route53 list-health-checks --region $PRIMARY_REGION --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='api.${ENVIRONMENT}.${DOMAIN_NAME}'].Id" --output text)

# Disable the health check to force failover
aws route53 update-health-check --health-check-id $HEALTH_CHECK_ID --disabled --region $PRIMARY_REGION
```

2. **Promote RDS Read Replica to Primary**

```bash
# Promote the RDS read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION

# Wait for RDS promotion to complete
aws rds wait db-instance-available \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION
```

3. **Update ElastiCache Global Datastore**

```bash
# Failover ElastiCache global datastore
aws elasticache failover-global-replication-group \
  --global-replication-group-id dust-cache-${ENVIRONMENT} \
  --primary-region $SECONDARY_REGION \
  --primary-replication-group-id dust-cache-${ENVIRONMENT}-secondary \
  --region $PRIMARY_REGION
```

4. **Update OpenSearch Cross-Cluster Replication**

```bash
# Update OpenSearch domain endpoint in application configuration
# This would typically be done through a configuration update in your application
```

### 3. Verify Application

1. **Deploy Latest Application Versions**

```bash
# Deploy the latest application versions to the secondary region if not already deployed
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-core-api-${ENVIRONMENT} \
  --force-new-deployment \
  --region $SECONDARY_REGION

aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-frontend-${ENVIRONMENT} \
  --force-new-deployment \
  --region $SECONDARY_REGION

aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-mcp-server-${ENVIRONMENT} \
  --force-new-deployment \
  --region $SECONDARY_REGION
```

2. **Verify Services are Running**

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster dust-${ENVIRONMENT} \
  --services dust-core-api-${ENVIRONMENT} dust-frontend-${ENVIRONMENT} dust-mcp-server-${ENVIRONMENT} \
  --region $SECONDARY_REGION \
  --query "services[*].[serviceName,status,runningCount,desiredCount]" \
  --output table
```

3. **Verify Database Connectivity**

```bash
# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text
```

4. **Verify Application Health**

```bash
# Check application health
curl -s https://api.${ENVIRONMENT}.${DOMAIN_NAME}/health
```

5. **Run Synthetic Tests**

```bash
# Run synthetic tests
aws synthetics start-canary \
  --name dust-frontend-canary-${ENVIRONMENT} \
  --region $SECONDARY_REGION

aws synthetics start-canary \
  --name dust-core-api-canary-${ENVIRONMENT} \
  --region $SECONDARY_REGION

aws synthetics start-canary \
  --name dust-mcp-server-canary-${ENVIRONMENT} \
  --region $SECONDARY_REGION
```

### 4. Notify Stakeholders

1. **Update Status Page**
   - Update the status page with the current status
   - Provide estimated time to full recovery

2. **Send Email Notification**
   - Send email notification to all stakeholders
   - Include current status and next steps

3. **Update Management**
   - Provide detailed update to management
   - Include impact assessment and recovery timeline

### 5. Monitor Secondary Region

1. **Monitor Performance**

```bash
# Monitor CPU utilization
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=dust-${ENVIRONMENT} Name=ServiceName,Value=dust-core-api-${ENVIRONMENT} \
  --start-time $(date -u -d "30 minutes ago" +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average \
  --region $SECONDARY_REGION
```

2. **Monitor Error Rates**

```bash
# Monitor HTTP 5xx errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_ELB_5XX_Count \
  --dimensions Name=LoadBalancer,Value=dust-alb-${ENVIRONMENT} \
  --start-time $(date -u -d "30 minutes ago" +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum \
  --region $SECONDARY_REGION
```

3. **Monitor Logs**

```bash
# Monitor application logs
aws logs filter-log-events \
  --log-group-name /ecs/dust-core-api \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d "30 minutes ago" +%s000) \
  --end-time $(date -u +%s000) \
  --region $SECONDARY_REGION
```

## Recovery Validation

- [ ] DNS failover is complete
- [ ] RDS read replica is promoted to primary
- [ ] ElastiCache global datastore is failed over
- [ ] OpenSearch cross-cluster replication is updated
- [ ] ECS services are running with desired task count
- [ ] Application health checks are passing
- [ ] Synthetic tests are passing
- [ ] Error rates are within acceptable limits

## Post-Recovery Actions

1. **Create New Read Replica in Primary Region**

```bash
# Create a new RDS read replica in the primary region
aws rds create-db-instance-read-replica \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT}-primary \
  --source-db-instance-identifier arn:aws:rds:${SECONDARY_REGION}:${ACCOUNT_ID}:db:dust-db-replica-${ENVIRONMENT} \
  --db-instance-class db.t3.medium \
  --availability-zone ${PRIMARY_REGION}a \
  --region $PRIMARY_REGION
```

2. **Update Documentation**
   - Update disaster recovery documentation with lessons learned
   - Update runbooks with any improvements

3. **Conduct Post-Mortem**
   - Schedule post-mortem meeting
   - Document root cause and resolution
   - Identify improvements for future incidents

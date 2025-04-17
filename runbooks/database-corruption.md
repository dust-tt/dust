# Runbook: Database Corruption Recovery

This runbook provides step-by-step instructions for recovering from database corruption.

## Prerequisites

- AWS CLI installed and configured
- jq installed
- Access to AWS Management Console
- Appropriate IAM permissions

## Variables

- `ENVIRONMENT`: The environment (e.g., dev, staging, prod)
- `REGION`: The AWS region (e.g., us-east-1)
- `DB_INSTANCE_ID`: The RDS instance identifier (e.g., dust-db-dev)
- `BACKUP_VAULT_NAME`: The AWS Backup vault name (e.g., dust-backup-vault-dev)

## Steps

### 1. Identify Corruption

1. **Assess the Situation**
   - Confirm that the database is experiencing corruption
   - Determine the extent of corruption
   - Identify the time when corruption occurred

2. **Notify Stakeholders**
   - Notify the incident commander
   - Notify the operations team
   - Notify management
   - Update the status page

### 2. Stop Write Operations

1. **Scale Down Application Services**

```bash
# Scale down Core API service
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-core-api-${ENVIRONMENT} \
  --desired-count 0 \
  --region $REGION

# Scale down MCP Server service
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-mcp-server-${ENVIRONMENT} \
  --desired-count 0 \
  --region $REGION
```

2. **Update Frontend to Show Maintenance Page**

```bash
# Update Frontend service to show maintenance page
# This would typically be done through a configuration update in your application
```

### 3. Restore Database

1. **Identify the Latest Backup Before Corruption**

```bash
# List available backups
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --by-resource-arn arn:aws:rds:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):db:${DB_INSTANCE_ID} \
  --region $REGION \
  --query "sort_by(RecoveryPoints, &CreationDate)[-10:]" \
  --output table
```

2. **Select the Appropriate Backup**
   - Identify the latest backup before corruption occurred
   - Note the recovery point ARN

3. **Restore Database from Backup**

```bash
# Restore database from backup
RECOVERY_POINT_ARN="arn:aws:backup:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):recovery-point:abcdef-1234-5678-9012-abcdef123456"
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn $RECOVERY_POINT_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --resource-type RDS \
  --metadata DBInstanceIdentifier=${DB_INSTANCE_ID}-restored \
  --region $REGION \
  --query "RestoreJobId" \
  --output text)

echo "Restore job started with ID: $RESTORE_JOB_ID"
```

4. **Monitor Restore Progress**

```bash
# Monitor restore progress
while true; do
  RESTORE_JOB_STATUS=$(aws backup describe-restore-job \
    --restore-job-id $RESTORE_JOB_ID \
    --region $REGION \
    --query "Status" \
    --output text)
  
  echo "Restore job status: $RESTORE_JOB_STATUS"
  
  if [ "$RESTORE_JOB_STATUS" == "COMPLETED" ]; then
    echo "Restore job completed successfully!"
    break
  elif [ "$RESTORE_JOB_STATUS" == "FAILED" ]; then
    echo "Restore job failed!"
    exit 1
  fi
  
  echo "Waiting for 30 seconds..."
  sleep 30
done
```

### 4. Verify Data Integrity

1. **Connect to Restored Database**
   - Connect to the restored database using a database client
   - Run integrity checks

2. **Run Application Tests**
   - Deploy a test version of the application connected to the restored database
   - Run application tests to verify functionality

3. **Verify Data Consistency**
   - Check for missing or corrupted data
   - Verify relationships between tables
   - Verify application functionality with the restored database

### 5. Switch to Restored Database

1. **Update Database Parameter Group**
   - If necessary, update the parameter group of the restored database to match the original

```bash
# Modify the restored database to use the original parameter group
aws rds modify-db-instance \
  --db-instance-identifier ${DB_INSTANCE_ID}-restored \
  --db-parameter-group-name dust-db-params-${ENVIRONMENT} \
  --apply-immediately \
  --region $REGION
```

2. **Update Database Security Group**
   - If necessary, update the security group of the restored database to match the original

```bash
# Modify the restored database to use the original security group
aws rds modify-db-instance \
  --db-instance-identifier ${DB_INSTANCE_ID}-restored \
  --vpc-security-group-ids sg-0123456789abcdef0 \
  --apply-immediately \
  --region $REGION
```

3. **Rename Databases**

```bash
# Rename the original database
aws rds modify-db-instance \
  --db-instance-identifier ${DB_INSTANCE_ID} \
  --new-db-instance-identifier ${DB_INSTANCE_ID}-corrupted \
  --apply-immediately \
  --region $REGION

# Wait for the rename to complete
aws rds wait db-instance-available \
  --db-instance-identifier ${DB_INSTANCE_ID}-corrupted \
  --region $REGION

# Rename the restored database to the original name
aws rds modify-db-instance \
  --db-instance-identifier ${DB_INSTANCE_ID}-restored \
  --new-db-instance-identifier ${DB_INSTANCE_ID} \
  --apply-immediately \
  --region $REGION

# Wait for the rename to complete
aws rds wait db-instance-available \
  --db-instance-identifier ${DB_INSTANCE_ID} \
  --region $REGION
```

### 6. Resume Operations

1. **Scale Up Application Services**

```bash
# Scale up Core API service
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-core-api-${ENVIRONMENT} \
  --desired-count 2 \
  --region $REGION

# Scale up MCP Server service
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-mcp-server-${ENVIRONMENT} \
  --desired-count 2 \
  --region $REGION
```

2. **Update Frontend to Remove Maintenance Page**

```bash
# Update Frontend service to remove maintenance page
# This would typically be done through a configuration update in your application
```

3. **Verify Application Functionality**

```bash
# Check application health
curl -s https://api.${ENVIRONMENT}.dust.example.com/health
```

### 7. Notify Stakeholders

1. **Update Status Page**
   - Update the status page with the current status
   - Indicate that the issue has been resolved

2. **Send Email Notification**
   - Send email notification to all stakeholders
   - Include information about the resolution

3. **Update Management**
   - Provide detailed update to management
   - Include impact assessment and resolution details

## Recovery Validation

- [ ] Database restore is complete
- [ ] Data integrity checks pass
- [ ] Application tests pass
- [ ] Database rename is complete
- [ ] Application services are scaled up
- [ ] Application health checks are passing
- [ ] Error rates are within acceptable limits

## Post-Recovery Actions

1. **Create New Backups**

```bash
# Create a new on-demand backup
aws backup start-backup-job \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --resource-arn arn:aws:rds:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):db:${DB_INSTANCE_ID} \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --region $REGION
```

2. **Implement Additional Monitoring**
   - Implement additional monitoring for database corruption
   - Set up alerts for early detection of corruption

3. **Update Documentation**
   - Update disaster recovery documentation with lessons learned
   - Update runbooks with any improvements

4. **Conduct Post-Mortem**
   - Schedule post-mortem meeting
   - Document root cause and resolution
   - Identify improvements for future incidents

5. **Clean Up**

```bash
# Delete the corrupted database after a waiting period
# Only do this after confirming the restored database is working correctly
aws rds delete-db-instance \
  --db-instance-identifier ${DB_INSTANCE_ID}-corrupted \
  --skip-final-snapshot \
  --region $REGION
```

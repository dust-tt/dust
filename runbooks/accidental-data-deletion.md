# Runbook: Accidental Data Deletion Recovery

This runbook provides step-by-step instructions for recovering from accidental data deletion.

## Prerequisites

- AWS CLI installed and configured
- jq installed
- Access to AWS Management Console
- Appropriate IAM permissions

## Variables

- `ENVIRONMENT`: The environment (e.g., dev, staging, prod)
- `REGION`: The AWS region (e.g., us-east-1)
- `RESOURCE_TYPE`: The type of resource (e.g., S3, RDS, ElastiCache, OpenSearch)
- `RESOURCE_ID`: The identifier of the resource (e.g., dust-application-data-dev, dust-db-dev)
- `BACKUP_VAULT_NAME`: The AWS Backup vault name (e.g., dust-backup-vault-dev)

## Steps

### 1. Identify Deleted Data

1. **Assess the Situation**
   - Confirm that data has been accidentally deleted
   - Determine what data was deleted
   - Identify when the deletion occurred
   - Determine the impact of the deletion

2. **Notify Stakeholders**
   - Notify the incident commander
   - Notify the operations team
   - Notify management
   - Update the status page

### 2. Stop Further Deletions

1. **Restrict Access**
   - Temporarily restrict access to the affected resource to prevent further deletions

```bash
# For S3 bucket
aws s3api put-bucket-policy \
  --bucket $RESOURCE_ID \
  --policy '{"Version":"2012-10-17","Statement":[{"Effect":"Deny","Principal":"*","Action":["s3:DeleteObject","s3:DeleteObjectVersion"],"Resource":"arn:aws:s3:::'$RESOURCE_ID'/*"}]}' \
  --region $REGION

# For RDS
aws rds modify-db-instance \
  --db-instance-identifier $RESOURCE_ID \
  --deletion-protection \
  --apply-immediately \
  --region $REGION
```

2. **Pause Application Services**
   - If necessary, pause application services that might continue to delete data

```bash
# Scale down services
aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-core-api-${ENVIRONMENT} \
  --desired-count 0 \
  --region $REGION

aws ecs update-service \
  --cluster dust-${ENVIRONMENT} \
  --service dust-mcp-server-${ENVIRONMENT} \
  --desired-count 0 \
  --region $REGION
```

### 3. Restore from Backup

#### 3.1 For S3 Bucket

1. **Check for Object Versioning**
   - If versioning is enabled, deleted objects can be recovered

```bash
# Check if versioning is enabled
aws s3api get-bucket-versioning \
  --bucket $RESOURCE_ID \
  --region $REGION
```

2. **Restore from Versioning**
   - If versioning is enabled, restore the deleted objects

```bash
# List deleted objects (delete markers)
aws s3api list-object-versions \
  --bucket $RESOURCE_ID \
  --prefix "path/to/deleted/objects/" \
  --region $REGION \
  --query "DeleteMarkers[?IsLatest==\`true\`].[Key, VersionId]" \
  --output text > delete_markers.txt

# Restore deleted objects
while read -r key version_id; do
  aws s3api delete-object \
    --bucket $RESOURCE_ID \
    --key "$key" \
    --version-id "$version_id" \
    --region $REGION
  echo "Restored $key"
done < delete_markers.txt
```

3. **Restore from Cross-Region Replication**
   - If cross-region replication is enabled, copy objects from the replica bucket

```bash
# List objects in the replica bucket
aws s3 ls s3://$RESOURCE_ID-replica-$ENVIRONMENT/ --recursive > replica_objects.txt

# Copy objects from replica bucket to primary bucket
while read -r object; do
  aws s3 cp s3://$RESOURCE_ID-replica-$ENVIRONMENT/$object s3://$RESOURCE_ID/$object --region $REGION
  echo "Copied $object"
done < replica_objects.txt
```

4. **Restore from AWS Backup**
   - If AWS Backup is configured, restore from backup

```bash
# List available backups
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --by-resource-arn arn:aws:s3:::$RESOURCE_ID \
  --region $REGION \
  --query "sort_by(RecoveryPoints, &CreationDate)[-10:]" \
  --output table

# Restore from backup
RECOVERY_POINT_ARN="arn:aws:backup:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):recovery-point:abcdef-1234-5678-9012-abcdef123456"
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn $RECOVERY_POINT_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --resource-type S3 \
  --metadata DestinationBucketName=$RESOURCE_ID \
  --region $REGION \
  --query "RestoreJobId" \
  --output text)

echo "Restore job started with ID: $RESTORE_JOB_ID"
```

#### 3.2 For RDS Database

1. **Restore from Point-in-Time Backup**
   - Restore the database to a point in time before the deletion

```bash
# Restore database to a point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier $RESOURCE_ID \
  --target-db-instance-identifier $RESOURCE_ID-restored \
  --restore-time $(date -u -d "2023-06-15 14:30:00" +%Y-%m-%dT%H:%M:%SZ) \
  --region $REGION
```

2. **Restore from AWS Backup**
   - If AWS Backup is configured, restore from backup

```bash
# List available backups
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --by-resource-arn arn:aws:rds:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):db:$RESOURCE_ID \
  --region $REGION \
  --query "sort_by(RecoveryPoints, &CreationDate)[-10:]" \
  --output table

# Restore from backup
RECOVERY_POINT_ARN="arn:aws:backup:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):recovery-point:abcdef-1234-5678-9012-abcdef123456"
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn $RECOVERY_POINT_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --resource-type RDS \
  --metadata DBInstanceIdentifier=$RESOURCE_ID-restored \
  --region $REGION \
  --query "RestoreJobId" \
  --output text)

echo "Restore job started with ID: $RESTORE_JOB_ID"
```

#### 3.3 For ElastiCache

1. **Restore from Backup**
   - Restore the ElastiCache cluster from backup

```bash
# List available backups
aws elasticache describe-snapshots \
  --cache-cluster-id $RESOURCE_ID \
  --region $REGION \
  --query "sort_by(Snapshots, &SnapshotCreateTime)[-10:]" \
  --output table

# Restore from backup
SNAPSHOT_NAME="automatic.dust-cache-dev-2023-06-15-00-00"
aws elasticache create-cache-cluster \
  --cache-cluster-id $RESOURCE_ID-restored \
  --snapshot-name $SNAPSHOT_NAME \
  --region $REGION
```

2. **Restore from AWS Backup**
   - If AWS Backup is configured, restore from backup

```bash
# List available backups
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --by-resource-arn arn:aws:elasticache:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):cluster:$RESOURCE_ID \
  --region $REGION \
  --query "sort_by(RecoveryPoints, &CreationDate)[-10:]" \
  --output table

# Restore from backup
RECOVERY_POINT_ARN="arn:aws:backup:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):recovery-point:abcdef-1234-5678-9012-abcdef123456"
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn $RECOVERY_POINT_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --resource-type ElastiCache \
  --metadata CacheClusterId=$RESOURCE_ID-restored \
  --region $REGION \
  --query "RestoreJobId" \
  --output text)

echo "Restore job started with ID: $RESTORE_JOB_ID"
```

#### 3.4 For OpenSearch

1. **Restore from Snapshot**
   - Restore the OpenSearch domain from snapshot

```bash
# List available snapshots
aws opensearch describe-domain \
  --domain-name $RESOURCE_ID \
  --region $REGION \
  --query "DomainStatus.SnapshotOptions" \
  --output table

# Restore from snapshot
SNAPSHOT_NAME="cs-automated-2023-06-15-00-00-00"
aws opensearch restore-domain-from-snapshot \
  --domain-name $RESOURCE_ID-restored \
  --snapshot-name $SNAPSHOT_NAME \
  --region $REGION
```

2. **Restore from AWS Backup**
   - If AWS Backup is configured, restore from backup

```bash
# List available backups
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --by-resource-arn arn:aws:es:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):domain/$RESOURCE_ID \
  --region $REGION \
  --query "sort_by(RecoveryPoints, &CreationDate)[-10:]" \
  --output table

# Restore from backup
RECOVERY_POINT_ARN="arn:aws:backup:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):recovery-point:abcdef-1234-5678-9012-abcdef123456"
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn $RECOVERY_POINT_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --resource-type OpenSearch \
  --metadata DomainName=$RESOURCE_ID-restored \
  --region $REGION \
  --query "RestoreJobId" \
  --output text)

echo "Restore job started with ID: $RESTORE_JOB_ID"
```

### 4. Verify Data Integrity

1. **Check Restored Data**
   - Verify that the restored data is complete and accurate

```bash
# For S3 bucket
aws s3 ls s3://$RESOURCE_ID/ --recursive | wc -l

# For RDS
# Connect to the database and run integrity checks
# This would typically be done using a database client

# For ElastiCache
# Connect to the cache and verify data
# This would typically be done using a Redis client

# For OpenSearch
# Connect to the domain and verify data
# This would typically be done using the OpenSearch API
```

2. **Run Application Tests**
   - Deploy a test version of the application connected to the restored resource
   - Run application tests to verify functionality

### 5. Switch to Restored Resource

#### 5.1 For RDS Database

1. **Rename Databases**

```bash
# Rename the original database
aws rds modify-db-instance \
  --db-instance-identifier $RESOURCE_ID \
  --new-db-instance-identifier $RESOURCE_ID-original \
  --apply-immediately \
  --region $REGION

# Wait for the rename to complete
aws rds wait db-instance-available \
  --db-instance-identifier $RESOURCE_ID-original \
  --region $REGION

# Rename the restored database to the original name
aws rds modify-db-instance \
  --db-instance-identifier $RESOURCE_ID-restored \
  --new-db-instance-identifier $RESOURCE_ID \
  --apply-immediately \
  --region $REGION

# Wait for the rename to complete
aws rds wait db-instance-available \
  --db-instance-identifier $RESOURCE_ID \
  --region $REGION
```

#### 5.2 For ElastiCache

1. **Update Application Configuration**
   - Update the application configuration to use the restored cache cluster

```bash
# This would typically be done through a configuration update in your application
```

#### 5.3 For OpenSearch

1. **Update Application Configuration**
   - Update the application configuration to use the restored domain

```bash
# This would typically be done through a configuration update in your application
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

2. **Remove Access Restrictions**

```bash
# For S3 bucket
aws s3api delete-bucket-policy \
  --bucket $RESOURCE_ID \
  --region $REGION

# For RDS
aws rds modify-db-instance \
  --db-instance-identifier $RESOURCE_ID \
  --no-deletion-protection \
  --apply-immediately \
  --region $REGION
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

- [ ] Data restore is complete
- [ ] Data integrity checks pass
- [ ] Application tests pass
- [ ] Resource switch is complete
- [ ] Application services are scaled up
- [ ] Application health checks are passing
- [ ] Error rates are within acceptable limits

## Post-Recovery Actions

1. **Create New Backups**

```bash
# Create a new on-demand backup
aws backup start-backup-job \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --resource-arn arn:aws:$RESOURCE_TYPE:${REGION}:$(aws sts get-caller-identity --query "Account" --output text):$RESOURCE_ID \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query "Account" --output text):role/service-role/AWSBackupDefaultServiceRole \
  --region $REGION
```

2. **Implement Additional Safeguards**
   - Implement additional safeguards to prevent accidental deletion
   - Set up alerts for unusual deletion patterns

3. **Update Documentation**
   - Update disaster recovery documentation with lessons learned
   - Update runbooks with any improvements

4. **Conduct Post-Mortem**
   - Schedule post-mortem meeting
   - Document root cause and resolution
   - Identify improvements for future incidents

5. **Clean Up**

```bash
# Delete the original resource after a waiting period
# Only do this after confirming the restored resource is working correctly
aws rds delete-db-instance \
  --db-instance-identifier $RESOURCE_ID-original \
  --skip-final-snapshot \
  --region $REGION
```

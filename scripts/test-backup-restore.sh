#!/bin/bash

# This script tests the backup and restore process

echo "Testing backup and restore process..."

# Set variables
ENVIRONMENT=${1:-dev}
BACKUP_VAULT_NAME=${2:-dust-backup-vault-dev}
RESOURCE_TYPE=${3:-RDS}
RESOURCE_ID=${4:-dust-db-dev}

# Verify prerequisites
echo "Verifying prerequisites..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
  echo "AWS CLI is not installed. Please install it first."
  exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo "jq is not installed. Please install it first."
  exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
  echo "AWS credentials are not configured. Please configure them first."
  exit 1
fi

# Start the test
echo "Starting backup and restore test for $RESOURCE_TYPE resource $RESOURCE_ID..."

# Create an on-demand backup
echo "Creating an on-demand backup..."

# Get the resource ARN based on the resource type
case $RESOURCE_TYPE in
  RDS)
    RESOURCE_ARN="arn:aws:rds:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):db:$RESOURCE_ID"
    ;;
  ElastiCache)
    RESOURCE_ARN="arn:aws:elasticache:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):cluster:$RESOURCE_ID"
    ;;
  OpenSearch)
    RESOURCE_ARN="arn:aws:es:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):domain/$RESOURCE_ID"
    ;;
  S3)
    RESOURCE_ARN="arn:aws:s3:::$RESOURCE_ID"
    ;;
  *)
    echo "Unsupported resource type: $RESOURCE_TYPE"
    exit 1
    ;;
esac

echo "Resource ARN: $RESOURCE_ARN"

# Start backup job
BACKUP_JOB_ID=$(aws backup start-backup-job \
  --backup-vault-name $BACKUP_VAULT_NAME \
  --resource-arn $RESOURCE_ARN \
  --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/service-role/AWSBackupDefaultServiceRole \
  --start-window-minutes 60 \
  --complete-window-minutes 180 \
  --lifecycle DeleteAfterDays=7 \
  --recovery-point-tags Environment=$ENVIRONMENT,TestBackup=true \
  --query 'BackupJobId' \
  --output text)

echo "Backup job started with ID: $BACKUP_JOB_ID"

# Wait for backup job to complete
echo "Waiting for backup job to complete..."
while true; do
  BACKUP_JOB_STATUS=$(aws backup describe-backup-job \
    --backup-job-id $BACKUP_JOB_ID \
    --query 'State' \
    --output text)
  
  echo "Backup job status: $BACKUP_JOB_STATUS"
  
  if [ "$BACKUP_JOB_STATUS" == "COMPLETED" ]; then
    echo "Backup job completed successfully!"
    break
  elif [ "$BACKUP_JOB_STATUS" == "FAILED" ]; then
    echo "Backup job failed!"
    exit 1
  fi
  
  echo "Waiting for 30 seconds..."
  sleep 30
done

# Get the recovery point ARN
RECOVERY_POINT_ARN=$(aws backup describe-backup-job \
  --backup-job-id $BACKUP_JOB_ID \
  --query 'RecoveryPointArn' \
  --output text)

echo "Recovery point ARN: $RECOVERY_POINT_ARN"

# Create a restore test environment
echo "Creating a restore test environment..."

# Generate a unique identifier for the test restore
TEST_RESTORE_ID=$(date +%Y%m%d%H%M%S)

# Start restore job
case $RESOURCE_TYPE in
  RDS)
    RESTORE_JOB_ID=$(aws backup start-restore-job \
      --recovery-point-arn $RECOVERY_POINT_ARN \
      --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/service-role/AWSBackupDefaultServiceRole \
      --resource-type RDS \
      --metadata DBInstanceIdentifier=$RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'RestoreJobId' \
      --output text)
    ;;
  ElastiCache)
    RESTORE_JOB_ID=$(aws backup start-restore-job \
      --recovery-point-arn $RECOVERY_POINT_ARN \
      --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/service-role/AWSBackupDefaultServiceRole \
      --resource-type ElastiCache \
      --metadata CacheClusterId=$RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'RestoreJobId' \
      --output text)
    ;;
  OpenSearch)
    RESTORE_JOB_ID=$(aws backup start-restore-job \
      --recovery-point-arn $RECOVERY_POINT_ARN \
      --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/service-role/AWSBackupDefaultServiceRole \
      --resource-type OpenSearch \
      --metadata DomainName=$RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'RestoreJobId' \
      --output text)
    ;;
  S3)
    # Create a new bucket for the restore
    NEW_BUCKET_NAME="$RESOURCE_ID-restore-$TEST_RESTORE_ID"
    aws s3 mb s3://$NEW_BUCKET_NAME
    
    RESTORE_JOB_ID=$(aws backup start-restore-job \
      --recovery-point-arn $RECOVERY_POINT_ARN \
      --iam-role-arn arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/service-role/AWSBackupDefaultServiceRole \
      --resource-type S3 \
      --metadata DestinationBucketName=$NEW_BUCKET_NAME \
      --query 'RestoreJobId' \
      --output text)
    ;;
  *)
    echo "Unsupported resource type: $RESOURCE_TYPE"
    exit 1
    ;;
esac

echo "Restore job started with ID: $RESTORE_JOB_ID"

# Wait for restore job to complete
echo "Waiting for restore job to complete..."
while true; do
  RESTORE_JOB_STATUS=$(aws backup describe-restore-job \
    --restore-job-id $RESTORE_JOB_ID \
    --query 'Status' \
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

# Verify the restored resource
echo "Verifying the restored resource..."

case $RESOURCE_TYPE in
  RDS)
    RESTORED_DB_STATUS=$(aws rds describe-db-instances \
      --db-instance-identifier $RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'DBInstances[0].DBInstanceStatus' \
      --output text)
    
    echo "Restored database status: $RESTORED_DB_STATUS"
    
    if [ "$RESTORED_DB_STATUS" == "available" ]; then
      echo "✅ Database restored successfully!"
    else
      echo "❌ Database restore verification failed. Status: $RESTORED_DB_STATUS"
    fi
    ;;
  ElastiCache)
    RESTORED_CACHE_STATUS=$(aws elasticache describe-cache-clusters \
      --cache-cluster-id $RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'CacheClusters[0].CacheClusterStatus' \
      --output text)
    
    echo "Restored cache status: $RESTORED_CACHE_STATUS"
    
    if [ "$RESTORED_CACHE_STATUS" == "available" ]; then
      echo "✅ Cache cluster restored successfully!"
    else
      echo "❌ Cache cluster restore verification failed. Status: $RESTORED_CACHE_STATUS"
    fi
    ;;
  OpenSearch)
    RESTORED_DOMAIN_STATUS=$(aws opensearch describe-domain \
      --domain-name $RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --query 'DomainStatus.Processing' \
      --output text)
    
    echo "Restored domain processing status: $RESTORED_DOMAIN_STATUS"
    
    if [ "$RESTORED_DOMAIN_STATUS" == "false" ]; then
      echo "✅ OpenSearch domain restored successfully!"
    else
      echo "❌ OpenSearch domain restore verification failed. Status: $RESTORED_DOMAIN_STATUS"
    fi
    ;;
  S3)
    # Check if the bucket exists
    if aws s3api head-bucket --bucket $NEW_BUCKET_NAME 2>/dev/null; then
      # List objects in the bucket
      OBJECT_COUNT=$(aws s3api list-objects-v2 --bucket $NEW_BUCKET_NAME --query 'length(Contents)' --output text)
      
      echo "Restored bucket object count: $OBJECT_COUNT"
      
      if [ "$OBJECT_COUNT" -gt 0 ]; then
        echo "✅ S3 bucket restored successfully with $OBJECT_COUNT objects!"
      else
        echo "❌ S3 bucket restore verification failed. No objects found in the bucket."
      fi
    else
      echo "❌ S3 bucket restore verification failed. Bucket does not exist."
    fi
    ;;
  *)
    echo "Unsupported resource type: $RESOURCE_TYPE"
    exit 1
    ;;
esac

# Cleanup
echo "Cleaning up test resources..."

case $RESOURCE_TYPE in
  RDS)
    echo "Deleting restored database..."
    aws rds delete-db-instance \
      --db-instance-identifier $RESOURCE_ID-restore-$TEST_RESTORE_ID \
      --skip-final-snapshot \
      --delete-automated-backups
    ;;
  ElastiCache)
    echo "Deleting restored cache cluster..."
    aws elasticache delete-cache-cluster \
      --cache-cluster-id $RESOURCE_ID-restore-$TEST_RESTORE_ID
    ;;
  OpenSearch)
    echo "Deleting restored OpenSearch domain..."
    aws opensearch delete-domain \
      --domain-name $RESOURCE_ID-restore-$TEST_RESTORE_ID
    ;;
  S3)
    echo "Deleting restored S3 bucket..."
    aws s3 rb s3://$NEW_BUCKET_NAME --force
    ;;
  *)
    echo "Unsupported resource type: $RESOURCE_TYPE"
    exit 1
    ;;
esac

echo "Backup and restore test completed!"
chmod +x scripts/test-backup-restore.sh

#!/bin/bash

# This script implements the security hardening plan

echo "Implementing security hardening plan..."

# Set variables
ENVIRONMENT=${1:-dev}
NOTIFICATION_EMAIL=${2:-security@example.com}
ENABLE_GUARDDUTY=${3:-true}
ENABLE_SECURITY_HUB=${4:-true}
ENABLE_CONFIG=${5:-true}
ENABLE_CLOUDTRAIL=${6:-true}
ENABLE_INSPECTOR=${7:-true}
ENABLE_MACIE=${8:-true}
ENABLE_DETECTIVE=${9:-true}
LOG_RETENTION_DAYS=${10:-90}

# Create directories if they don't exist
mkdir -p cloudformation
mkdir -p scripts
mkdir -p reports

# Deploy security hardening CloudFormation stack
echo "Deploying security hardening CloudFormation stack..."
aws cloudformation deploy \
  --template-file cloudformation/security-hardening.yaml \
  --stack-name security-hardening-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    NotificationEmail=${NOTIFICATION_EMAIL} \
    EnableGuardDuty=${ENABLE_GUARDDUTY} \
    EnableSecurityHub=${ENABLE_SECURITY_HUB} \
    EnableConfig=${ENABLE_CONFIG} \
    EnableCloudTrail=${ENABLE_CLOUDTRAIL} \
    EnableInspector=${ENABLE_INSPECTOR} \
    EnableMacie=${ENABLE_MACIE} \
    EnableDetective=${ENABLE_DETECTIVE} \
    LogRetentionDays=${LOG_RETENTION_DAYS}

# Deploy IAM policies CloudFormation stack
echo "Deploying IAM policies CloudFormation stack..."
aws cloudformation deploy \
  --template-file cloudformation/iam-policies.yaml \
  --stack-name iam-policies-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT}

# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=dust-vpc-${ENVIRONMENT}" --query "Vpcs[0].VpcId" --output text)

# Get subnet IDs
PUBLIC_SUBNET_1_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-public-subnet-1-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)
PUBLIC_SUBNET_2_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-public-subnet-2-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)
PRIVATE_SUBNET_1_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-private-subnet-1-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)
PRIVATE_SUBNET_2_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-private-subnet-2-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)
DATABASE_SUBNET_1_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-database-subnet-1-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)
DATABASE_SUBNET_2_ID=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=dust-database-subnet-2-${ENVIRONMENT}" --query "Subnets[0].SubnetId" --output text)

# Deploy network security CloudFormation stack
echo "Deploying network security CloudFormation stack..."
aws cloudformation deploy \
  --template-file cloudformation/network-security.yaml \
  --stack-name network-security-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    VpcId=${VPC_ID} \
    PublicSubnet1Id=${PUBLIC_SUBNET_1_ID} \
    PublicSubnet2Id=${PUBLIC_SUBNET_2_ID} \
    PrivateSubnet1Id=${PRIVATE_SUBNET_1_ID} \
    PrivateSubnet2Id=${PRIVATE_SUBNET_2_ID} \
    DatabaseSubnet1Id=${DATABASE_SUBNET_1_ID} \
    DatabaseSubnet2Id=${DATABASE_SUBNET_2_ID} \
    AllowedCidrForSSH=10.0.0.0/16 \
    AllowedCidrForHTTPS=0.0.0.0/0

# Enable MFA for all IAM users
echo "Enabling MFA for all IAM users..."
IAM_USERS=$(aws iam list-users --query "Users[*].UserName" --output text)
for USER in $IAM_USERS; do
  echo "Checking MFA for user: $USER"
  MFA_DEVICES=$(aws iam list-mfa-devices --user-name $USER --query "MFADevices[*]" --output text)
  if [ -z "$MFA_DEVICES" ]; then
    echo "MFA not enabled for user: $USER"
    echo "Please enable MFA for user: $USER"
  else
    echo "MFA already enabled for user: $USER"
  fi
done

# Enable encryption for S3 buckets
echo "Enabling encryption for S3 buckets..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[*].Name" --output text)
for BUCKET in $S3_BUCKETS; do
  if [[ $BUCKET == *"dust"* ]] && [[ $BUCKET == *"$ENVIRONMENT"* ]]; then
    echo "Enabling encryption for bucket: $BUCKET"
    aws s3api put-bucket-encryption \
      --bucket $BUCKET \
      --server-side-encryption-configuration '{"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}'
    
    echo "Enabling public access block for bucket: $BUCKET"
    aws s3api put-public-access-block \
      --bucket $BUCKET \
      --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    echo "Enabling bucket policy for bucket: $BUCKET"
    aws s3api put-bucket-policy \
      --bucket $BUCKET \
      --policy '{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "DenyInsecureTransport",
            "Effect": "Deny",
            "Principal": "*",
            "Action": "s3:*",
            "Resource": ["arn:aws:s3:::'$BUCKET'", "arn:aws:s3:::'$BUCKET'/*"],
            "Condition": {
              "Bool": {
                "aws:SecureTransport": "false"
              }
            }
          }
        ]
      }'
  fi
done

# Enable encryption for RDS instances
echo "Enabling encryption for RDS instances..."
RDS_INSTANCES=$(aws rds describe-db-instances --query "DBInstances[*].DBInstanceIdentifier" --output text)
for INSTANCE in $RDS_INSTANCES; do
  if [[ $INSTANCE == *"dust"* ]] && [[ $INSTANCE == *"$ENVIRONMENT"* ]]; then
    echo "Checking encryption for RDS instance: $INSTANCE"
    ENCRYPTION_ENABLED=$(aws rds describe-db-instances --db-instance-identifier $INSTANCE --query "DBInstances[0].StorageEncrypted" --output text)
    if [ "$ENCRYPTION_ENABLED" == "false" ]; then
      echo "Encryption not enabled for RDS instance: $INSTANCE"
      echo "Creating snapshot for RDS instance: $INSTANCE"
      SNAPSHOT_ID="$INSTANCE-snapshot-$(date +%Y%m%d%H%M%S)"
      aws rds create-db-snapshot \
        --db-instance-identifier $INSTANCE \
        --db-snapshot-identifier $SNAPSHOT_ID
      
      echo "Waiting for snapshot to complete..."
      aws rds wait db-snapshot-available \
        --db-snapshot-identifier $SNAPSHOT_ID
      
      echo "Creating encrypted copy of snapshot..."
      ENCRYPTED_SNAPSHOT_ID="$SNAPSHOT_ID-encrypted"
      aws rds copy-db-snapshot \
        --source-db-snapshot-identifier $SNAPSHOT_ID \
        --target-db-snapshot-identifier $ENCRYPTED_SNAPSHOT_ID \
        --kms-key-id alias/aws/rds
      
      echo "Waiting for encrypted snapshot to complete..."
      aws rds wait db-snapshot-available \
        --db-snapshot-identifier $ENCRYPTED_SNAPSHOT_ID
      
      echo "Restoring RDS instance from encrypted snapshot..."
      NEW_INSTANCE_ID="$INSTANCE-encrypted"
      aws rds restore-db-instance-from-db-snapshot \
        --db-instance-identifier $NEW_INSTANCE_ID \
        --db-snapshot-identifier $ENCRYPTED_SNAPSHOT_ID
      
      echo "Waiting for RDS instance to be available..."
      aws rds wait db-instance-available \
        --db-instance-identifier $NEW_INSTANCE_ID
      
      echo "Updating application to use new RDS instance..."
      echo "Please update your application to use the new RDS instance: $NEW_INSTANCE_ID"
    else
      echo "Encryption already enabled for RDS instance: $INSTANCE"
    fi
  fi
done

# Enable encryption for EBS volumes
echo "Enabling encryption for EBS volumes..."
EBS_VOLUMES=$(aws ec2 describe-volumes --query "Volumes[*].VolumeId" --output text)
for VOLUME in $EBS_VOLUMES; do
  echo "Checking encryption for EBS volume: $VOLUME"
  ENCRYPTION_ENABLED=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Encrypted" --output text)
  if [ "$ENCRYPTION_ENABLED" == "false" ]; then
    echo "Encryption not enabled for EBS volume: $VOLUME"
    echo "Creating snapshot for EBS volume: $VOLUME"
    SNAPSHOT_ID=$(aws ec2 create-snapshot \
      --volume-id $VOLUME \
      --description "Snapshot for encryption" \
      --query "SnapshotId" \
      --output text)
    
    echo "Waiting for snapshot to complete..."
    aws ec2 wait snapshot-completed \
      --snapshot-ids $SNAPSHOT_ID
    
    echo "Creating encrypted copy of snapshot..."
    ENCRYPTED_SNAPSHOT_ID=$(aws ec2 copy-snapshot \
      --source-region $(aws configure get region) \
      --source-snapshot-id $SNAPSHOT_ID \
      --encrypted \
      --query "SnapshotId" \
      --output text)
    
    echo "Waiting for encrypted snapshot to complete..."
    aws ec2 wait snapshot-completed \
      --snapshot-ids $ENCRYPTED_SNAPSHOT_ID
    
    echo "Getting volume information..."
    VOLUME_AZ=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].AvailabilityZone" --output text)
    VOLUME_SIZE=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Size" --output text)
    VOLUME_TYPE=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].VolumeType" --output text)
    VOLUME_IOPS=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Iops" --output text 2>/dev/null || echo "")
    VOLUME_THROUGHPUT=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Throughput" --output text 2>/dev/null || echo "")
    
    echo "Creating encrypted volume..."
    ENCRYPTED_VOLUME_ID=$(aws ec2 create-volume \
      --availability-zone $VOLUME_AZ \
      --snapshot-id $ENCRYPTED_SNAPSHOT_ID \
      --volume-type $VOLUME_TYPE \
      --size $VOLUME_SIZE \
      --encrypted \
      --query "VolumeId" \
      --output text)
    
    if [ -n "$VOLUME_IOPS" ] && [ "$VOLUME_IOPS" != "None" ]; then
      aws ec2 modify-volume \
        --volume-id $ENCRYPTED_VOLUME_ID \
        --iops $VOLUME_IOPS
    fi
    
    if [ -n "$VOLUME_THROUGHPUT" ] && [ "$VOLUME_THROUGHPUT" != "None" ]; then
      aws ec2 modify-volume \
        --volume-id $ENCRYPTED_VOLUME_ID \
        --throughput $VOLUME_THROUGHPUT
    fi
    
    echo "Waiting for encrypted volume to be available..."
    aws ec2 wait volume-available \
      --volume-ids $ENCRYPTED_VOLUME_ID
    
    echo "Getting instance information..."
    INSTANCE_ID=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Attachments[0].InstanceId" --output text)
    DEVICE_NAME=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Attachments[0].Device" --output text)
    
    if [ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ]; then
      echo "Stopping instance: $INSTANCE_ID"
      aws ec2 stop-instances --instance-ids $INSTANCE_ID
      
      echo "Waiting for instance to stop..."
      aws ec2 wait instance-stopped --instance-ids $INSTANCE_ID
      
      echo "Detaching volume: $VOLUME"
      aws ec2 detach-volume --volume-id $VOLUME
      
      echo "Attaching encrypted volume: $ENCRYPTED_VOLUME_ID"
      aws ec2 attach-volume \
        --volume-id $ENCRYPTED_VOLUME_ID \
        --instance-id $INSTANCE_ID \
        --device $DEVICE_NAME
      
      echo "Starting instance: $INSTANCE_ID"
      aws ec2 start-instances --instance-ids $INSTANCE_ID
    else
      echo "Volume not attached to any instance"
    fi
  else
    echo "Encryption already enabled for EBS volume: $VOLUME"
  fi
done

# Enable encryption for ElastiCache clusters
echo "Enabling encryption for ElastiCache clusters..."
ELASTICACHE_CLUSTERS=$(aws elasticache describe-cache-clusters --query "CacheClusters[*].CacheClusterId" --output text)
for CLUSTER in $ELASTICACHE_CLUSTERS; do
  if [[ $CLUSTER == *"dust"* ]] && [[ $CLUSTER == *"$ENVIRONMENT"* ]]; then
    echo "Checking encryption for ElastiCache cluster: $CLUSTER"
    ENCRYPTION_ENABLED=$(aws elasticache describe-cache-clusters --cache-cluster-id $CLUSTER --show-cache-node-info --query "CacheClusters[0].TransitEncryptionEnabled" --output text 2>/dev/null || echo "false")
    if [ "$ENCRYPTION_ENABLED" == "false" ]; then
      echo "Encryption not enabled for ElastiCache cluster: $CLUSTER"
      echo "Please create a new ElastiCache cluster with encryption enabled and migrate data"
    else
      echo "Encryption already enabled for ElastiCache cluster: $CLUSTER"
    fi
  fi
done

# Enable encryption for OpenSearch domains
echo "Enabling encryption for OpenSearch domains..."
OPENSEARCH_DOMAINS=$(aws opensearch list-domain-names --query "DomainNames[*].DomainName" --output text)
for DOMAIN in $OPENSEARCH_DOMAINS; do
  if [[ $DOMAIN == *"dust"* ]] && [[ $DOMAIN == *"$ENVIRONMENT"* ]]; then
    echo "Checking encryption for OpenSearch domain: $DOMAIN"
    ENCRYPTION_ENABLED=$(aws opensearch describe-domain --domain-name $DOMAIN --query "DomainStatus.EncryptionAtRestOptions.Enabled" --output text)
    if [ "$ENCRYPTION_ENABLED" == "false" ]; then
      echo "Encryption not enabled for OpenSearch domain: $DOMAIN"
      echo "Please create a new OpenSearch domain with encryption enabled and migrate data"
    else
      echo "Encryption already enabled for OpenSearch domain: $DOMAIN"
    fi
  fi
done

# Enable WAF for ALB
echo "Enabling WAF for ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers --names dust-alb-${ENVIRONMENT} --query "LoadBalancers[0].LoadBalancerArn" --output text)
WAF_WEB_ACL_ID=$(aws cloudformation describe-stacks --stack-name network-security-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='WAFWebACL'].OutputValue" --output text)

if [ -n "$ALB_ARN" ] && [ -n "$WAF_WEB_ACL_ID" ]; then
  echo "Associating WAF Web ACL with ALB..."
  aws wafv2 associate-web-acl \
    --web-acl-arn $WAF_WEB_ACL_ID \
    --resource-arn $ALB_ARN
else
  echo "ALB or WAF Web ACL not found"
fi

# Enable Shield Advanced for ALB
echo "Enabling Shield Advanced for ALB..."
if [ -n "$ALB_ARN" ]; then
  echo "Shield Advanced already enabled for ALB through CloudFormation"
else
  echo "ALB not found"
fi

# Run Security Hub compliance check
echo "Running Security Hub compliance check..."
if [ "$ENABLE_SECURITY_HUB" == "true" ]; then
  aws securityhub get-findings \
    --filters '{"ComplianceStatus":[{"Value":"FAILED","Comparison":"EQUALS"}]}' \
    --max-items 100 > reports/security-hub-findings.json
  
  echo "Security Hub findings saved to reports/security-hub-findings.json"
else
  echo "Security Hub not enabled"
fi

# Run AWS Config compliance check
echo "Running AWS Config compliance check..."
if [ "$ENABLE_CONFIG" == "true" ]; then
  aws configservice describe-compliance-by-config-rule \
    --compliance-types NON_COMPLIANT > reports/config-compliance.json
  
  echo "AWS Config compliance check saved to reports/config-compliance.json"
else
  echo "AWS Config not enabled"
fi

echo "Security hardening plan implementation completed!"
chmod +x scripts/implement-security-hardening.sh

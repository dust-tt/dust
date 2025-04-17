#!/bin/bash

# This script implements the disaster recovery plan

echo "Implementing disaster recovery plan..."

# Set variables
PRIMARY_REGION=${1:-us-east-1}
SECONDARY_REGION=${2:-us-west-2}
ENVIRONMENT=${3:-dev}
DOMAIN_NAME=${4:-dust.example.com}
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)

# Create directories if they don't exist
mkdir -p cloudformation
mkdir -p scripts

# Deploy cross-region replication
echo "Deploying cross-region replication..."
aws cloudformation deploy \
  --template-file cloudformation/cross-region-replication.yaml \
  --stack-name cross-region-replication-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    PrimaryRegion=${PRIMARY_REGION} \
    SecondaryRegion=${SECONDARY_REGION} \
    ApplicationDataBucketName=dust-application-data \
    DatabaseIdentifier=dust-db \
    ElastiCacheClusterId=dust-cache \
    OpenSearchDomainName=dust-search \
    CoreApiRepositoryName=dust-core-api \
    FrontendRepositoryName=dust-frontend \
    MCPServerRepositoryName=dust-mcp-server

# Deploy backup and restore
echo "Deploying backup and restore..."
aws cloudformation deploy \
  --template-file cloudformation/backup-restore.yaml \
  --stack-name backup-restore-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    BackupVaultName=dust-backup-vault \
    DailyBackupSchedule="cron(0 0 * * ? *)" \
    WeeklyBackupSchedule="cron(0 0 ? * SUN *)" \
    DailyBackupRetentionDays=30 \
    WeeklyBackupRetentionDays=90 \
    NotificationEmail=alerts@example.com

# Create secondary region infrastructure
echo "Creating secondary region infrastructure..."

# Create KMS key in secondary region
echo "Creating KMS key in secondary region..."
KMS_KEY_ID=$(aws kms create-key \
  --description "Dust platform encryption key" \
  --region ${SECONDARY_REGION} \
  --query "KeyMetadata.KeyId" \
  --output text)

# Create KMS key alias in secondary region
echo "Creating KMS key alias in secondary region..."
aws kms create-alias \
  --alias-name alias/dust-encryption-key \
  --target-key-id ${KMS_KEY_ID} \
  --region ${SECONDARY_REGION}

# Create VPC in secondary region
echo "Creating VPC in secondary region..."
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --region ${SECONDARY_REGION} \
  --query "Vpc.VpcId" \
  --output text)

# Tag VPC
aws ec2 create-tags \
  --resources ${VPC_ID} \
  --tags Key=Name,Value=dust-vpc-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Create subnets in secondary region
echo "Creating subnets in secondary region..."
SUBNET_1_ID=$(aws ec2 create-subnet \
  --vpc-id ${VPC_ID} \
  --cidr-block 10.0.1.0/24 \
  --availability-zone ${SECONDARY_REGION}a \
  --region ${SECONDARY_REGION} \
  --query "Subnet.SubnetId" \
  --output text)

SUBNET_2_ID=$(aws ec2 create-subnet \
  --vpc-id ${VPC_ID} \
  --cidr-block 10.0.2.0/24 \
  --availability-zone ${SECONDARY_REGION}b \
  --region ${SECONDARY_REGION} \
  --query "Subnet.SubnetId" \
  --output text)

# Tag subnets
aws ec2 create-tags \
  --resources ${SUBNET_1_ID} \
  --tags Key=Name,Value=dust-subnet-1-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

aws ec2 create-tags \
  --resources ${SUBNET_2_ID} \
  --tags Key=Name,Value=dust-subnet-2-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Create internet gateway in secondary region
echo "Creating internet gateway in secondary region..."
IGW_ID=$(aws ec2 create-internet-gateway \
  --region ${SECONDARY_REGION} \
  --query "InternetGateway.InternetGatewayId" \
  --output text)

# Tag internet gateway
aws ec2 create-tags \
  --resources ${IGW_ID} \
  --tags Key=Name,Value=dust-igw-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Attach internet gateway to VPC
aws ec2 attach-internet-gateway \
  --internet-gateway-id ${IGW_ID} \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION}

# Create route table in secondary region
echo "Creating route table in secondary region..."
ROUTE_TABLE_ID=$(aws ec2 create-route-table \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "RouteTable.RouteTableId" \
  --output text)

# Tag route table
aws ec2 create-tags \
  --resources ${ROUTE_TABLE_ID} \
  --tags Key=Name,Value=dust-rtb-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Create route to internet gateway
aws ec2 create-route \
  --route-table-id ${ROUTE_TABLE_ID} \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id ${IGW_ID} \
  --region ${SECONDARY_REGION}

# Associate route table with subnets
aws ec2 associate-route-table \
  --route-table-id ${ROUTE_TABLE_ID} \
  --subnet-id ${SUBNET_1_ID} \
  --region ${SECONDARY_REGION}

aws ec2 associate-route-table \
  --route-table-id ${ROUTE_TABLE_ID} \
  --subnet-id ${SUBNET_2_ID} \
  --region ${SECONDARY_REGION}

# Create security groups in secondary region
echo "Creating security groups in secondary region..."
ALB_SG_ID=$(aws ec2 create-security-group \
  --group-name dust-alb-sg-${ENVIRONMENT} \
  --description "Security group for ALB" \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "GroupId" \
  --output text)

ECS_SG_ID=$(aws ec2 create-security-group \
  --group-name dust-ecs-sg-${ENVIRONMENT} \
  --description "Security group for ECS tasks" \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "GroupId" \
  --output text)

RDS_SG_ID=$(aws ec2 create-security-group \
  --group-name dust-rds-sg-${ENVIRONMENT} \
  --description "Security group for RDS" \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "GroupId" \
  --output text)

ELASTICACHE_SG_ID=$(aws ec2 create-security-group \
  --group-name dust-elasticache-sg-${ENVIRONMENT} \
  --description "Security group for ElastiCache" \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "GroupId" \
  --output text)

OPENSEARCH_SG_ID=$(aws ec2 create-security-group \
  --group-name dust-opensearch-sg-${ENVIRONMENT} \
  --description "Security group for OpenSearch" \
  --vpc-id ${VPC_ID} \
  --region ${SECONDARY_REGION} \
  --query "GroupId" \
  --output text)

# Tag security groups
aws ec2 create-tags \
  --resources ${ALB_SG_ID} \
  --tags Key=Name,Value=dust-alb-sg-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

aws ec2 create-tags \
  --resources ${ECS_SG_ID} \
  --tags Key=Name,Value=dust-ecs-sg-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

aws ec2 create-tags \
  --resources ${RDS_SG_ID} \
  --tags Key=Name,Value=dust-rds-sg-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

aws ec2 create-tags \
  --resources ${ELASTICACHE_SG_ID} \
  --tags Key=Name,Value=dust-elasticache-sg-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

aws ec2 create-tags \
  --resources ${OPENSEARCH_SG_ID} \
  --tags Key=Name,Value=dust-opensearch-sg-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Configure security group rules
# ALB security group
aws ec2 authorize-security-group-ingress \
  --group-id ${ALB_SG_ID} \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0 \
  --region ${SECONDARY_REGION}

# ECS security group
aws ec2 authorize-security-group-ingress \
  --group-id ${ECS_SG_ID} \
  --protocol tcp \
  --port 3000-3005 \
  --source-group ${ALB_SG_ID} \
  --region ${SECONDARY_REGION}

# RDS security group
aws ec2 authorize-security-group-ingress \
  --group-id ${RDS_SG_ID} \
  --protocol tcp \
  --port 5432 \
  --source-group ${ECS_SG_ID} \
  --region ${SECONDARY_REGION}

# ElastiCache security group
aws ec2 authorize-security-group-ingress \
  --group-id ${ELASTICACHE_SG_ID} \
  --protocol tcp \
  --port 6379 \
  --source-group ${ECS_SG_ID} \
  --region ${SECONDARY_REGION}

# OpenSearch security group
aws ec2 authorize-security-group-ingress \
  --group-id ${OPENSEARCH_SG_ID} \
  --protocol tcp \
  --port 443 \
  --source-group ${ECS_SG_ID} \
  --region ${SECONDARY_REGION}

# Create ECS cluster in secondary region
echo "Creating ECS cluster in secondary region..."
aws ecs create-cluster \
  --cluster-name dust-${ENVIRONMENT} \
  --region ${SECONDARY_REGION}

# Create ALB in secondary region
echo "Creating ALB in secondary region..."
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name dust-alb-${ENVIRONMENT} \
  --subnets ${SUBNET_1_ID} ${SUBNET_2_ID} \
  --security-groups ${ALB_SG_ID} \
  --region ${SECONDARY_REGION} \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text)

# Create target groups in secondary region
echo "Creating target groups in secondary region..."
CORE_API_TG_ARN=$(aws elbv2 create-target-group \
  --name dust-core-api-tg-${ENVIRONMENT} \
  --protocol HTTP \
  --port 3000 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --region ${SECONDARY_REGION} \
  --query "TargetGroups[0].TargetGroupArn" \
  --output text)

FRONTEND_TG_ARN=$(aws elbv2 create-target-group \
  --name dust-frontend-tg-${ENVIRONMENT} \
  --protocol HTTP \
  --port 3000 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --region ${SECONDARY_REGION} \
  --query "TargetGroups[0].TargetGroupArn" \
  --output text)

MCP_SERVER_TG_ARN=$(aws elbv2 create-target-group \
  --name dust-mcp-server-tg-${ENVIRONMENT} \
  --protocol HTTP \
  --port 3005 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --region ${SECONDARY_REGION} \
  --query "TargetGroups[0].TargetGroupArn" \
  --output text)

# Create HTTPS listener
echo "Creating HTTPS listener..."
# Note: In a real implementation, you would need to create an ACM certificate first
# For this example, we'll use HTTP instead of HTTPS
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn ${ALB_ARN} \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=${FRONTEND_TG_ARN} \
  --region ${SECONDARY_REGION} \
  --query "Listeners[0].ListenerArn" \
  --output text)

# Create listener rules
echo "Creating listener rules..."
aws elbv2 create-rule \
  --listener-arn ${LISTENER_ARN} \
  --priority 10 \
  --conditions Field=path-pattern,Values='/api/*' \
  --actions Type=forward,TargetGroupArn=${CORE_API_TG_ARN} \
  --region ${SECONDARY_REGION}

aws elbv2 create-rule \
  --listener-arn ${LISTENER_ARN} \
  --priority 20 \
  --conditions Field=path-pattern,Values='/mcp/*' \
  --actions Type=forward,TargetGroupArn=${MCP_SERVER_TG_ARN} \
  --region ${SECONDARY_REGION}

# Create ECS task definitions in secondary region
echo "Creating ECS task definitions in secondary region..."
# Note: In a real implementation, you would need to create task definitions for each service
# For this example, we'll just create placeholder task definitions

# Create CloudWatch log groups in secondary region
echo "Creating CloudWatch log groups in secondary region..."
aws logs create-log-group \
  --log-group-name /ecs/dust-core-api \
  --region ${SECONDARY_REGION}

aws logs create-log-group \
  --log-group-name /ecs/dust-frontend \
  --region ${SECONDARY_REGION}

aws logs create-log-group \
  --log-group-name /ecs/dust-mcp-server \
  --region ${SECONDARY_REGION}

# Create ECS services in secondary region
echo "Creating ECS services in secondary region..."
# Note: In a real implementation, you would need to create ECS services for each service
# For this example, we'll just create placeholder services

# Create Route 53 health check for secondary region
echo "Creating Route 53 health check for secondary region..."
SECONDARY_HEALTH_CHECK_ID=$(aws route53 create-health-check \
  --caller-reference $(date +%s) \
  --health-check-config \
    Type=HTTPS,ResourcePath=/health,FullyQualifiedDomainName=api.${ENVIRONMENT}.${DOMAIN_NAME},Port=443,RequestInterval=30,FailureThreshold=3 \
  --region ${PRIMARY_REGION} \
  --query "HealthCheck.Id" \
  --output text)

# Tag health check
aws route53 change-tags-for-resource \
  --resource-type healthcheck \
  --resource-id ${SECONDARY_HEALTH_CHECK_ID} \
  --add-tags Key=Name,Value=dust-secondary-region-health-check-${ENVIRONMENT} \
  --region ${PRIMARY_REGION}

echo "Disaster recovery plan implementation completed!"
chmod +x scripts/implement-dr-plan.sh

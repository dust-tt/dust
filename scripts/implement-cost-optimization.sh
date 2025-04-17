#!/bin/bash

# This script implements the cost optimization plan

echo "Implementing cost optimization plan..."

# Set variables
ENVIRONMENT=${1:-dev}
NOTIFICATION_EMAIL=${2:-alerts@example.com}
DAILY_BUDGET_AMOUNT=${3:-50}
MONTHLY_BUDGET_AMOUNT=${4:-1500}
BUDGET_THRESHOLD=${5:-80}
COST_ANOMALY_THRESHOLD=${6:-20}

# Create directories if they don't exist
mkdir -p cloudformation
mkdir -p cdk/lib
mkdir -p scripts
mkdir -p reports

# Deploy cost optimization CloudFormation stack
echo "Deploying cost optimization CloudFormation stack..."
aws cloudformation deploy \
  --template-file cloudformation/cost-optimization.yaml \
  --stack-name cost-optimization-${ENVIRONMENT} \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    Environment=${ENVIRONMENT} \
    NotificationEmail=${NOTIFICATION_EMAIL} \
    DailyBudgetAmount=${DAILY_BUDGET_AMOUNT} \
    MonthlyBudgetAmount=${MONTHLY_BUDGET_AMOUNT} \
    BudgetThreshold=${BUDGET_THRESHOLD} \
    CostAnomalyThreshold=${COST_ANOMALY_THRESHOLD}

# Set up AWS CDK for auto scaling
echo "Setting up AWS CDK for auto scaling..."
cd cdk
npm install
npm run build

# Deploy auto scaling stack
echo "Deploying auto scaling stack..."
npx cdk deploy AutoScalingStack-${ENVIRONMENT} --require-approval never

# Deploy S3 lifecycle stack
echo "Deploying S3 lifecycle stack..."
npx cdk deploy S3LifecycleStack-${ENVIRONMENT} --require-approval never

# Return to root directory
cd ..

# Install dependencies for Reserved Instance recommendations script
echo "Installing dependencies for Reserved Instance recommendations script..."
pip install boto3 tabulate

# Generate Reserved Instance recommendations
echo "Generating Reserved Instance recommendations..."
python scripts/reserved-instance-recommendations.py --output-dir reports --format csv

# Implement resource tagging
echo "Implementing resource tagging..."

# Tag EC2 instances
echo "Tagging EC2 instances..."
EC2_INSTANCES=$(aws ec2 describe-instances --query "Reservations[*].Instances[*].InstanceId" --output text)
for INSTANCE_ID in $EC2_INSTANCES; do
  aws ec2 create-tags \
    --resources $INSTANCE_ID \
    --tags Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=dust Key=CostCenter,Value=cc-123
done

# Tag RDS instances
echo "Tagging RDS instances..."
RDS_INSTANCES=$(aws rds describe-db-instances --query "DBInstances[*].DBInstanceIdentifier" --output text)
for INSTANCE_ID in $RDS_INSTANCES; do
  aws rds add-tags-to-resource \
    --resource-name arn:aws:rds:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):db:$INSTANCE_ID \
    --tags Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=dust Key=CostCenter,Value=cc-123
done

# Tag ElastiCache clusters
echo "Tagging ElastiCache clusters..."
ELASTICACHE_CLUSTERS=$(aws elasticache describe-cache-clusters --query "CacheClusters[*].CacheClusterId" --output text)
for CLUSTER_ID in $ELASTICACHE_CLUSTERS; do
  aws elasticache add-tags-to-resource \
    --resource-name arn:aws:elasticache:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):cluster:$CLUSTER_ID \
    --tags Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=dust Key=CostCenter,Value=cc-123
done

# Tag OpenSearch domains
echo "Tagging OpenSearch domains..."
OPENSEARCH_DOMAINS=$(aws opensearch list-domain-names --query "DomainNames[*].DomainName" --output text)
for DOMAIN_NAME in $OPENSEARCH_DOMAINS; do
  aws opensearch add-tags \
    --arn arn:aws:es:$(aws configure get region):$(aws sts get-caller-identity --query 'Account' --output text):domain/$DOMAIN_NAME \
    --tag-list Key=Environment,Value=${ENVIRONMENT} Key=Project,Value=dust Key=CostCenter,Value=cc-123
done

# Tag S3 buckets
echo "Tagging S3 buckets..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[*].Name" --output text)
for BUCKET_NAME in $S3_BUCKETS; do
  if [[ $BUCKET_NAME == *"dust"* ]]; then
    # Determine bucket type
    if [[ $BUCKET_NAME == *"log"* ]]; then
      BUCKET_TYPE="Logs"
    elif [[ $BUCKET_NAME == *"backup"* ]]; then
      BUCKET_TYPE="Backup"
    else
      BUCKET_TYPE="Application"
    fi
    
    aws s3api put-bucket-tagging \
      --bucket $BUCKET_NAME \
      --tagging "TagSet=[{Key=Environment,Value=${ENVIRONMENT}},{Key=Project,Value=dust},{Key=CostCenter,Value=cc-123},{Key=Type,Value=${BUCKET_TYPE}}]"
  fi
done

# Tag ECS clusters
echo "Tagging ECS clusters..."
ECS_CLUSTERS=$(aws ecs list-clusters --query "clusterArns" --output text)
for CLUSTER_ARN in $ECS_CLUSTERS; do
  CLUSTER_NAME=$(echo $CLUSTER_ARN | cut -d'/' -f2)
  aws ecs tag-resource \
    --resource-arn $CLUSTER_ARN \
    --tags key=Environment,value=${ENVIRONMENT} key=Project,value=dust key=CostCenter,value=cc-123
done

# Tag ECS services
echo "Tagging ECS services..."
for CLUSTER_ARN in $ECS_CLUSTERS; do
  CLUSTER_NAME=$(echo $CLUSTER_ARN | cut -d'/' -f2)
  ECS_SERVICES=$(aws ecs list-services --cluster $CLUSTER_NAME --query "serviceArns" --output text)
  
  for SERVICE_ARN in $ECS_SERVICES; do
    aws ecs tag-resource \
      --resource-arn $SERVICE_ARN \
      --tags key=Environment,value=${ENVIRONMENT} key=Project,value=dust key=CostCenter,value=cc-123
  done
done

# Optimize EBS volumes
echo "Optimizing EBS volumes..."
EBS_VOLUMES=$(aws ec2 describe-volumes --query "Volumes[?VolumeType=='gp2'].VolumeId" --output text)
for VOLUME_ID in $EBS_VOLUMES; do
  echo "Converting volume $VOLUME_ID from gp2 to gp3..."
  aws ec2 modify-volume \
    --volume-id $VOLUME_ID \
    --volume-type gp3 \
    --iops 3000 \
    --throughput 125
done

# Right-size ECS tasks
echo "Right-sizing ECS tasks..."
if [ "$ENVIRONMENT" != "production" ]; then
  # Get ECS services
  ECS_CLUSTER="dust-${ENVIRONMENT}"
  ECS_SERVICES=$(aws ecs list-services --cluster $ECS_CLUSTER --query "serviceArns[*]" --output text)
  
  for SERVICE_ARN in $ECS_SERVICES; do
    SERVICE_NAME=$(echo $SERVICE_ARN | cut -d'/' -f3)
    
    # Get current task definition
    TASK_DEF=$(aws ecs describe-services --cluster $ECS_CLUSTER --services $SERVICE_NAME --query "services[0].taskDefinition" --output text)
    
    # Get task definition details
    TASK_DEF_FAMILY=$(echo $TASK_DEF | cut -d'/' -f2 | cut -d':' -f1)
    TASK_DEF_REVISION=$(echo $TASK_DEF | cut -d'/' -f2 | cut -d':' -f2)
    
    # Get current task definition JSON
    TASK_DEF_JSON=$(aws ecs describe-task-definition --task-definition $TASK_DEF_FAMILY:$TASK_DEF_REVISION --query "taskDefinition" --output json)
    
    # Create a new task definition with optimized resources
    OPTIMIZED_TASK_DEF_JSON=$(echo $TASK_DEF_JSON | jq '.containerDefinitions[0].cpu = 256 | .containerDefinitions[0].memory = 512 | .cpu = "256" | .memory = "512"')
    
    # Register the new task definition
    echo $OPTIMIZED_TASK_DEF_JSON > optimized-task-def.json
    NEW_TASK_DEF_ARN=$(aws ecs register-task-definition --cli-input-json file://optimized-task-def.json --query "taskDefinition.taskDefinitionArn" --output text)
    
    # Update the service to use the new task definition
    aws ecs update-service \
      --cluster $ECS_CLUSTER \
      --service $SERVICE_NAME \
      --task-definition $NEW_TASK_DEF_ARN
    
    echo "Right-sized ECS service: $SERVICE_NAME"
  done
  
  # Clean up
  rm optimized-task-def.json
fi

echo "Cost optimization plan implementation completed!"
chmod +x scripts/implement-cost-optimization.sh

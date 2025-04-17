#!/bin/bash

# This script verifies the cost optimization plan

echo "Verifying cost optimization plan..."

# Set variables
ENVIRONMENT=${1:-dev}

# Check CloudFormation stack
echo "Checking CloudFormation stack..."
if aws cloudformation describe-stacks --stack-name cost-optimization-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Cost optimization CloudFormation stack exists"
else
  echo "❌ Cost optimization CloudFormation stack does not exist"
fi

# Check AWS Budgets
echo "Checking AWS Budgets..."
DAILY_BUDGET=$(aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query 'Account' --output text) --query "Budgets[?BudgetName=='dust-daily-budget-${ENVIRONMENT}']" --output text)
MONTHLY_BUDGET=$(aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query 'Account' --output text) --query "Budgets[?BudgetName=='dust-monthly-budget-${ENVIRONMENT}']" --output text)

if [ -n "$DAILY_BUDGET" ]; then
  echo "✅ Daily budget exists"
else
  echo "❌ Daily budget does not exist"
fi

if [ -n "$MONTHLY_BUDGET" ]; then
  echo "✅ Monthly budget exists"
else
  echo "❌ Monthly budget does not exist"
fi

# Check Cost Anomaly Detection
echo "Checking Cost Anomaly Detection..."
ANOMALY_MONITOR=$(aws ce list-cost-anomaly-monitors --query "AnomalyMonitors[?MonitorName=='dust-cost-anomaly-monitor-${ENVIRONMENT}']" --output text)

if [ -n "$ANOMALY_MONITOR" ]; then
  echo "✅ Cost anomaly monitor exists"
else
  echo "❌ Cost anomaly monitor does not exist"
fi

# Check CloudWatch Dashboard
echo "Checking CloudWatch Dashboard..."
DASHBOARD=$(aws cloudwatch get-dashboard --dashboard-name dust-cost-dashboard-${ENVIRONMENT} --output text 2>/dev/null || echo "")

if [ -n "$DASHBOARD" ]; then
  echo "✅ Cost dashboard exists"
else
  echo "❌ Cost dashboard does not exist"
fi

# Check Lambda Functions
echo "Checking Lambda Functions..."
RESOURCE_CLEANUP_FUNCTION=$(aws lambda get-function --function-name dust-resource-cleanup-${ENVIRONMENT} --query "Configuration.FunctionName" --output text 2>/dev/null || echo "")
COST_REPORT_FUNCTION=$(aws lambda get-function --function-name dust-cost-report-${ENVIRONMENT} --query "Configuration.FunctionName" --output text 2>/dev/null || echo "")

if [ -n "$RESOURCE_CLEANUP_FUNCTION" ]; then
  echo "✅ Resource cleanup function exists"
else
  echo "❌ Resource cleanup function does not exist"
fi

if [ -n "$COST_REPORT_FUNCTION" ]; then
  echo "✅ Cost report function exists"
else
  echo "❌ Cost report function does not exist"
fi

# Check Auto Scaling Configuration
echo "Checking Auto Scaling Configuration..."
ECS_CLUSTER="dust-${ENVIRONMENT}"
ECS_SERVICES=$(aws ecs list-services --cluster $ECS_CLUSTER --query "serviceArns[*]" --output text 2>/dev/null || echo "")

if [ -n "$ECS_SERVICES" ]; then
  for SERVICE_ARN in $ECS_SERVICES; do
    SERVICE_NAME=$(echo $SERVICE_ARN | cut -d'/' -f3)
    
    # Check if service has auto scaling
    SCALABLE_TARGET=$(aws application-autoscaling describe-scalable-targets \
      --service-namespace ecs \
      --resource-ids service/$ECS_CLUSTER/$SERVICE_NAME \
      --query "ScalableTargets[0].ResourceId" \
      --output text 2>/dev/null || echo "")
    
    if [ -n "$SCALABLE_TARGET" ]; then
      echo "✅ Auto scaling configured for ECS service: $SERVICE_NAME"
      
      # Check scaling policies
      SCALING_POLICIES=$(aws application-autoscaling describe-scaling-policies \
        --service-namespace ecs \
        --resource-ids service/$ECS_CLUSTER/$SERVICE_NAME \
        --query "ScalingPolicies[*].PolicyName" \
        --output text 2>/dev/null || echo "")
      
      if [ -n "$SCALING_POLICIES" ]; then
        echo "  ✅ Scaling policies configured for ECS service: $SERVICE_NAME"
      else
        echo "  ❌ No scaling policies configured for ECS service: $SERVICE_NAME"
      fi
    else
      echo "❌ Auto scaling not configured for ECS service: $SERVICE_NAME"
    fi
  done
else
  echo "❌ No ECS services found in cluster: $ECS_CLUSTER"
fi

# Check S3 Lifecycle Policies
echo "Checking S3 Lifecycle Policies..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[*].Name" --output text)

for BUCKET_NAME in $S3_BUCKETS; do
  if [[ $BUCKET_NAME == *"dust"* ]] && [[ $BUCKET_NAME == *"$ENVIRONMENT"* ]]; then
    # Check if bucket has lifecycle policy
    LIFECYCLE_POLICY=$(aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET_NAME --output text 2>/dev/null || echo "")
    
    if [ -n "$LIFECYCLE_POLICY" ]; then
      echo "✅ Lifecycle policy configured for S3 bucket: $BUCKET_NAME"
    else
      echo "❌ No lifecycle policy configured for S3 bucket: $BUCKET_NAME"
    fi
  fi
done

# Check Resource Tagging
echo "Checking Resource Tagging..."

# Check EC2 instances
echo "Checking EC2 instance tags..."
EC2_INSTANCES=$(aws ec2 describe-instances --query "Reservations[*].Instances[*].InstanceId" --output text)

for INSTANCE_ID in $EC2_INSTANCES; do
  # Check if instance has Environment tag
  ENVIRONMENT_TAG=$(aws ec2 describe-tags --filters "Name=resource-id,Values=$INSTANCE_ID" "Name=key,Values=Environment" --query "Tags[0].Value" --output text 2>/dev/null || echo "")
  
  if [ -n "$ENVIRONMENT_TAG" ]; then
    echo "✅ Environment tag configured for EC2 instance: $INSTANCE_ID"
  else
    echo "❌ No Environment tag configured for EC2 instance: $INSTANCE_ID"
  fi
  
  # Check if instance has CostCenter tag
  COST_CENTER_TAG=$(aws ec2 describe-tags --filters "Name=resource-id,Values=$INSTANCE_ID" "Name=key,Values=CostCenter" --query "Tags[0].Value" --output text 2>/dev/null || echo "")
  
  if [ -n "$COST_CENTER_TAG" ]; then
    echo "✅ CostCenter tag configured for EC2 instance: $INSTANCE_ID"
  else
    echo "❌ No CostCenter tag configured for EC2 instance: $INSTANCE_ID"
  fi
done

# Check EBS volumes
echo "Checking EBS volume types..."
GP2_VOLUMES=$(aws ec2 describe-volumes --filters "Name=volume-type,Values=gp2" --query "Volumes[*].VolumeId" --output text)
GP3_VOLUMES=$(aws ec2 describe-volumes --filters "Name=volume-type,Values=gp3" --query "Volumes[*].VolumeId" --output text)

if [ -n "$GP2_VOLUMES" ]; then
  echo "❌ Found gp2 volumes that should be migrated to gp3:"
  for VOLUME_ID in $GP2_VOLUMES; do
    echo "  - $VOLUME_ID"
  done
else
  echo "✅ No gp2 volumes found"
fi

if [ -n "$GP3_VOLUMES" ]; then
  echo "✅ Found gp3 volumes:"
  echo "  - Count: $(echo $GP3_VOLUMES | wc -w)"
fi

# Check ECS task sizes
echo "Checking ECS task sizes..."
if [ "$ENVIRONMENT" != "production" ]; then
  for SERVICE_ARN in $ECS_SERVICES; do
    SERVICE_NAME=$(echo $SERVICE_ARN | cut -d'/' -f3)
    
    # Get current task definition
    TASK_DEF=$(aws ecs describe-services --cluster $ECS_CLUSTER --services $SERVICE_NAME --query "services[0].taskDefinition" --output text)
    
    # Get CPU and memory
    CPU=$(aws ecs describe-task-definition --task-definition $TASK_DEF --query "taskDefinition.cpu" --output text)
    MEMORY=$(aws ecs describe-task-definition --task-definition $TASK_DEF --query "taskDefinition.memory" --output text)
    
    if [ "$CPU" -le 256 ] && [ "$MEMORY" -le 512 ]; then
      echo "✅ ECS service $SERVICE_NAME is right-sized (CPU: $CPU, Memory: $MEMORY)"
    else
      echo "❌ ECS service $SERVICE_NAME is not right-sized (CPU: $CPU, Memory: $MEMORY)"
    fi
  done
fi

echo "Cost optimization plan verification completed!"
chmod +x scripts/verify-cost-optimization.sh

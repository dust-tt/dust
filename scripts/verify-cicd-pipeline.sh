#!/bin/bash

# This script verifies the CI/CD pipeline

echo "Verifying CI/CD pipeline..."

# Set variables
ENVIRONMENT=${1:-development}
AWS_REGION=${2:-us-east-1}

# Check GitHub Actions workflow file
echo "Checking GitHub Actions workflow file..."
if [ -f ".github/workflows/ci-cd.yml" ]; then
  echo "✅ GitHub Actions workflow file exists"
else
  echo "❌ GitHub Actions workflow file does not exist"
fi

# Check AWS task definition files
echo "Checking AWS task definition files..."
for SERVICE in core-api frontend mcp-server; do
  TASK_DEF_FILE=".aws/task-definition-$SERVICE.json"
  if [ -f "$TASK_DEF_FILE" ]; then
    echo "✅ Task definition file exists for $SERVICE"
  else
    echo "❌ Task definition file does not exist for $SERVICE"
  fi
done

# Check ECR repositories
echo "Checking ECR repositories..."
for REPO in dust-core-api dust-frontend dust-mcp-server; do
  if aws ecr describe-repositories --repository-names $REPO --region $AWS_REGION > /dev/null 2>&1; then
    echo "✅ ECR repository exists: $REPO"
  else
    echo "❌ ECR repository does not exist: $REPO"
  fi
done

# Check IAM roles
echo "Checking IAM roles..."
if aws iam get-role --role-name ecsTaskExecutionRole > /dev/null 2>&1; then
  echo "✅ ECS task execution role exists"
else
  echo "❌ ECS task execution role does not exist"
fi

for SERVICE in core-api frontend mcp-server; do
  ROLE_NAME="dust-$SERVICE-task-role"
  if aws iam get-role --role-name $ROLE_NAME > /dev/null 2>&1; then
    echo "✅ Task role exists: $ROLE_NAME"
  else
    echo "❌ Task role does not exist: $ROLE_NAME"
  fi
done

# Check CloudWatch log groups
echo "Checking CloudWatch log groups..."
for SERVICE in core-api frontend mcp-server; do
  LOG_GROUP_NAME="/ecs/dust-$SERVICE"
  if aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP_NAME --region $AWS_REGION | grep -q $LOG_GROUP_NAME; then
    echo "✅ Log group exists: $LOG_GROUP_NAME"
  else
    echo "❌ Log group does not exist: $LOG_GROUP_NAME"
  fi
done

# Check ECS cluster
echo "Checking ECS cluster..."
CLUSTER_NAME="dust-$ENVIRONMENT"
if aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION | grep -q $CLUSTER_NAME; then
  echo "✅ ECS cluster exists: $CLUSTER_NAME"
else
  echo "❌ ECS cluster does not exist: $CLUSTER_NAME"
fi

# Check ECS services
echo "Checking ECS services..."
for SERVICE in core-api frontend mcp-server; do
  SERVICE_NAME="dust-$SERVICE-$ENVIRONMENT"
  if aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION | grep -q $SERVICE_NAME; then
    echo "✅ ECS service exists: $SERVICE_NAME"
    
    # Check service status
    SERVICE_STATUS=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION --query 'services[0].status' --output text)
    if [ "$SERVICE_STATUS" == "ACTIVE" ]; then
      echo "  ✅ Service status is ACTIVE"
    else
      echo "  ❌ Service status is not ACTIVE: $SERVICE_STATUS"
    fi
    
    # Check desired count
    DESIRED_COUNT=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION --query 'services[0].desiredCount' --output text)
    RUNNING_COUNT=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION --query 'services[0].runningCount' --output text)
    
    if [ "$DESIRED_COUNT" -gt 0 ]; then
      echo "  ✅ Service has desired count > 0: $DESIRED_COUNT"
    else
      echo "  ❌ Service has desired count = 0"
    fi
    
    if [ "$RUNNING_COUNT" -eq "$DESIRED_COUNT" ]; then
      echo "  ✅ Service has running count = desired count: $RUNNING_COUNT"
    else
      echo "  ❌ Service has running count != desired count: $RUNNING_COUNT/$DESIRED_COUNT"
    fi
  else
    echo "❌ ECS service does not exist: $SERVICE_NAME"
  fi
done

# Check SonarQube configuration
echo "Checking SonarQube configuration..."
if [ -f "sonar-project.properties" ]; then
  echo "✅ SonarQube configuration file exists"
else
  echo "❌ SonarQube configuration file does not exist"
fi

# Check Snyk configuration
echo "Checking Snyk configuration..."
if [ -f ".snyk" ]; then
  echo "✅ Snyk configuration file exists"
else
  echo "❌ Snyk configuration file does not exist"
fi

# Check GitHub repository
echo "Checking GitHub repository..."
echo "Please manually verify the following:"
echo "1. Branch protection rules are configured for main, staging, and development branches"
echo "2. Required GitHub secrets are configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SONAR_TOKEN, SONAR_HOST_URL, SNYK_TOKEN, SLACK_WEBHOOK)"
echo "3. GitHub Actions workflow is enabled"

echo "CI/CD pipeline verification completed!"
chmod +x scripts/verify-cicd-pipeline.sh

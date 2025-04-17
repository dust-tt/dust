#!/bin/bash

# This script implements the CI/CD pipeline

echo "Implementing CI/CD pipeline..."

# Set variables
GITHUB_REPO=${1:-jamon8888/dust}
AWS_REGION=${2:-us-east-1}
AWS_ACCOUNT_ID=${3:-123456789012}
ENVIRONMENT=${4:-development}

# Create directories if they don't exist
mkdir -p .github/workflows
mkdir -p .aws
mkdir -p scripts

# Create ECR repositories if they don't exist
echo "Creating ECR repositories..."
for REPO in dust-core-api dust-frontend dust-mcp-server; do
  if ! aws ecr describe-repositories --repository-names $REPO --region $AWS_REGION > /dev/null 2>&1; then
    echo "Creating ECR repository: $REPO"
    aws ecr create-repository \
      --repository-name $REPO \
      --region $AWS_REGION \
      --image-scanning-configuration scanOnPush=true
  else
    echo "ECR repository already exists: $REPO"
  fi
done

# Create IAM roles if they don't exist
echo "Creating IAM roles..."

# ECS task execution role
if ! aws iam get-role --role-name ecsTaskExecutionRole > /dev/null 2>&1; then
  echo "Creating ECS task execution role..."
  aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Service": "ecs-tasks.amazonaws.com"
          },
          "Action": "sts:AssumeRole"
        }
      ]
    }'
  
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
  
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
else
  echo "ECS task execution role already exists"
fi

# Create task roles for each service
for SERVICE in core-api frontend mcp-server; do
  ROLE_NAME="dust-$SERVICE-task-role"
  if ! aws iam get-role --role-name $ROLE_NAME > /dev/null 2>&1; then
    echo "Creating task role: $ROLE_NAME"
    aws iam create-role \
      --role-name $ROLE_NAME \
      --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }'
    
    # Add specific permissions based on service
    case $SERVICE in
      core-api)
        aws iam put-role-policy \
          --role-name $ROLE_NAME \
          --policy-name $ROLE_NAME-policy \
          --policy-document '{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Effect": "Allow",
                "Action": [
                  "secretsmanager:GetSecretValue",
                  "s3:GetObject",
                  "s3:PutObject",
                  "s3:ListBucket"
                ],
                "Resource": "*"
              }
            ]
          }'
        ;;
      frontend)
        aws iam put-role-policy \
          --role-name $ROLE_NAME \
          --policy-name $ROLE_NAME-policy \
          --policy-document '{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Effect": "Allow",
                "Action": [
                  "secretsmanager:GetSecretValue"
                ],
                "Resource": "*"
              }
            ]
          }'
        ;;
      mcp-server)
        aws iam put-role-policy \
          --role-name $ROLE_NAME \
          --policy-name $ROLE_NAME-policy \
          --policy-document '{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Effect": "Allow",
                "Action": [
                  "secretsmanager:GetSecretValue",
                  "s3:GetObject",
                  "s3:PutObject",
                  "s3:ListBucket"
                ],
                "Resource": "*"
              }
            ]
          }'
        ;;
    esac
  else
    echo "Task role already exists: $ROLE_NAME"
  fi
done

# Create CloudWatch log groups if they don't exist
echo "Creating CloudWatch log groups..."
for SERVICE in core-api frontend mcp-server; do
  LOG_GROUP_NAME="/ecs/dust-$SERVICE"
  if ! aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP_NAME --region $AWS_REGION | grep -q $LOG_GROUP_NAME; then
    echo "Creating log group: $LOG_GROUP_NAME"
    aws logs create-log-group \
      --log-group-name $LOG_GROUP_NAME \
      --region $AWS_REGION
    
    aws logs put-retention-policy \
      --log-group-name $LOG_GROUP_NAME \
      --retention-in-days 30 \
      --region $AWS_REGION
  else
    echo "Log group already exists: $LOG_GROUP_NAME"
  fi
done

# Create ECS cluster if it doesn't exist
echo "Creating ECS cluster..."
CLUSTER_NAME="dust-$ENVIRONMENT"
if ! aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION | grep -q $CLUSTER_NAME; then
  echo "Creating ECS cluster: $CLUSTER_NAME"
  aws ecs create-cluster \
    --cluster-name $CLUSTER_NAME \
    --region $AWS_REGION \
    --tags key=Environment,value=$ENVIRONMENT key=Project,value=dust
else
  echo "ECS cluster already exists: $CLUSTER_NAME"
fi

# Create ECS services if they don't exist
echo "Creating ECS services..."
for SERVICE in core-api frontend mcp-server; do
  SERVICE_NAME="dust-$SERVICE-$ENVIRONMENT"
  if ! aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION | grep -q $SERVICE_NAME; then
    echo "Creating ECS service: $SERVICE_NAME"
    
    # Create task definition
    TASK_DEF_FILE=".aws/task-definition-$SERVICE.json"
    
    # Update task definition with environment-specific values
    sed -i "s/123456789012/$AWS_ACCOUNT_ID/g" $TASK_DEF_FILE
    sed -i "s/production/$ENVIRONMENT/g" $TASK_DEF_FILE
    
    # Register task definition
    TASK_DEF_ARN=$(aws ecs register-task-definition \
      --cli-input-json file://$TASK_DEF_FILE \
      --region $AWS_REGION \
      --query 'taskDefinition.taskDefinitionArn' \
      --output text)
    
    # Create service
    aws ecs create-service \
      --cluster $CLUSTER_NAME \
      --service-name $SERVICE_NAME \
      --task-definition $TASK_DEF_ARN \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[subnet-12345678,subnet-87654321],securityGroups=[sg-12345678],assignPublicIp=ENABLED}" \
      --region $AWS_REGION \
      --tags key=Environment,value=$ENVIRONMENT key=Project,value=dust key=Service,value=$SERVICE
  else
    echo "ECS service already exists: $SERVICE_NAME"
  fi
done

# Create GitHub secrets
echo "Creating GitHub secrets..."
echo "Please manually add the following secrets to your GitHub repository:"
echo "AWS_ACCESS_KEY_ID: Your AWS access key ID"
echo "AWS_SECRET_ACCESS_KEY: Your AWS secret access key"
echo "SONAR_TOKEN: Your SonarQube token"
echo "SONAR_HOST_URL: Your SonarQube host URL"
echo "SNYK_TOKEN: Your Snyk token"
echo "SLACK_WEBHOOK: Your Slack webhook URL"

# Create SonarQube configuration
echo "Creating SonarQube configuration..."
cat > sonar-project.properties << EOF
# SonarQube project configuration
sonar.projectKey=dust
sonar.projectName=Dust Platform
sonar.projectVersion=1.0

# Sources
sonar.sources=src
sonar.exclusions=**/*.test.js,**/*.test.ts,**/*.test.tsx,**/*.spec.js,**/*.spec.ts,**/*.spec.tsx,**/node_modules/**,**/coverage/**

# Tests
sonar.tests=src
sonar.test.inclusions=**/*.test.js,**/*.test.ts,**/*.test.tsx,**/*.spec.js,**/*.spec.ts,**/*.spec.tsx
sonar.javascript.lcov.reportPaths=coverage/lcov.info

# Quality gates
sonar.qualitygate.wait=true
EOF

# Create Snyk configuration
echo "Creating Snyk configuration..."
cat > .snyk << EOF
# Snyk configuration
version: v1.25.0
ignore: {}
severity-threshold: high
fail-on: all
scan-all-unmanaged: true
exclude:
  - node_modules
  - dist
  - build
  - coverage
EOF

# Create GitHub branch protection rules
echo "Creating GitHub branch protection rules..."
echo "Please manually configure branch protection rules for the following branches:"
echo "main: Require pull request reviews, status checks, and branch to be up to date"
echo "staging: Require pull request reviews, status checks, and branch to be up to date"
echo "development: Require status checks and branch to be up to date"

echo "CI/CD pipeline implementation completed!"
chmod +x scripts/implement-cicd-pipeline.sh

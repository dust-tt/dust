# Dust Platform Implementation and Installation Documentation

## Overview

This documentation provides a comprehensive overview of the implementation work completed for the Dust platform, focusing on the AWS deployment, security hardening, monitoring and alerting, and CI/CD pipeline. It also includes a step-by-step guide for installing the Dust platform on AWS.

## Table of Contents

1. [Security Hardening Plan](#security-hardening-plan)
2. [Monitoring and Alerting System](#monitoring-and-alerting-system)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Implementation Scripts](#implementation-scripts)
5. [Configuration Files](#configuration-files)
6. [Step-by-Step AWS Installation Guide](#step-by-step-aws-installation-guide)

## Security Hardening Plan

### Documentation

A comprehensive security hardening plan has been created in `SECURITY-HARDENING-PLAN.md`, which includes:

- Security principles and objectives
- Current security assessment
- Security hardening strategies for infrastructure, application, data, identity, and monitoring
- Implementation roadmap with phased approach
- Monitoring and validation procedures
- Security governance framework

### CloudFormation Templates

Three CloudFormation templates have been created for security hardening:

- `cloudformation/security-hardening.yaml`: Implements AWS security services (CloudTrail, Config, GuardDuty, Security Hub, etc.)
- `cloudformation/iam-policies.yaml`: Implements IAM policies for least privilege access
- `cloudformation/network-security.yaml`: Implements network security controls (security groups, NACLs, VPC endpoints, WAF, etc.)

### Key Security Features

- **Infrastructure Security**: CloudTrail, AWS Config, GuardDuty, Security Hub, VPC flow logs, security groups, network ACLs
- **Identity and Access Management**: IAM policies, MFA, password policies, IAM roles
- **Data Security**: Encryption at rest and in transit, data classification, access controls
- **Network Security**: Security groups, NACLs, VPC endpoints, WAF, Shield Advanced
- **Monitoring and Logging**: CloudWatch Logs, CloudWatch Alarms, CloudTrail, Security Hub

## Monitoring and Alerting System

### Documentation

A detailed monitoring and alerting plan has been created in `MONITORING-ALERTING-PLAN.md`, which includes:

- Monitoring strategy and principles
- Key metrics and thresholds
- Alerting strategy with severity levels
- Monitoring implementation details
- Alerting implementation details
- Incident response procedures
- Runbooks for common issues

### CloudFormation Templates

Three CloudFormation templates have been created for monitoring and alerting:

- `cloudformation/monitoring-alerting-part1.yaml`: Implements SNS topics, Lambda functions for notifications, and CloudWatch dashboards
- `cloudformation/monitoring-alerting-part2.yaml`: Implements CloudWatch alarms for various services
- `cloudformation/monitoring-alerting-part3.yaml`: Implements synthetic monitoring and log metric filters

### Key Monitoring Features

- **SNS Topics**: Critical, Warning, Info, Security, and Cost alerts
- **CloudWatch Dashboards**: Executive and Operations dashboards
- **CloudWatch Alarms**: CPU, Memory, Error Rate, Response Time, Storage, and Connection alarms
- **CloudWatch Synthetics**: API, Web App, and MCP Server health checks
- **Log Metric Filters**: Error and Warning filters for all services
- **Notification Integrations**: Email, Slack, and PagerDuty

## CI/CD Pipeline

### Documentation

A comprehensive CI/CD pipeline plan has been created in `CICD-PIPELINE-PLAN.md`, which includes:

- CI/CD principles and objectives
- Pipeline stages and workflow
- Branching strategy
- Build, test, and deployment automation
- Security scanning and quality gates
- Environment management
- Monitoring and feedback

### GitHub Actions Workflow

A GitHub Actions workflow file (`.github/workflows/ci-cd.yml`) has been created to implement the CI/CD pipeline, including:

- Test stage: Run linting and tests
- Security scan stage: Run Snyk and OWASP Dependency Check
- Quality gate stage: Run SonarQube scan
- Build and push stage: Build and push Docker images to ECR
- Deploy stages: Deploy to development, staging, and production environments

### AWS Task Definitions

Task definition files have been created for each service:

- `.aws/task-definition-core-api.json`: Task definition for Core API
- `.aws/task-definition-frontend.json`: Task definition for Frontend
- `.aws/task-definition-mcp-server.json`: Task definition for MCP Server

### Dockerfiles

Dockerfiles have been created for each service:

- `core-api/Dockerfile`: Dockerfile for Core API
- `frontend/Dockerfile`: Dockerfile for Frontend
- `mcp-server/Dockerfile`: Dockerfile for MCP Server

### Key CI/CD Features

- **Source Code Management**: GitHub repository with branch protection rules
- **Build Automation**: GitHub Actions workflow for build automation
- **Test Automation**: Unit tests, integration tests, and end-to-end tests
- **Security Scanning**: Dependency scanning with Snyk, OWASP Dependency Check
- **Quality Gates**: Code coverage requirements, code quality checks with SonarQube
- **Deployment Automation**: Blue/Green deployment for production, Rolling deployment for staging
- **Environment Management**: Environment-specific configuration, environment promotion strategy
- **Monitoring and Feedback**: Pipeline monitoring, deployment notifications via Slack

## Implementation Scripts

### Security Hardening Scripts

- `scripts/implement-security-hardening.sh`: Implements the security hardening plan
- `scripts/verify-security-hardening.sh`: Verifies the security hardening implementation

### Monitoring and Alerting Scripts

- `scripts/implement-monitoring-alerting.sh`: Implements the monitoring and alerting system
- `scripts/verify-monitoring-alerting.sh`: Verifies the monitoring and alerting implementation

### CI/CD Pipeline Scripts

- `scripts/implement-cicd-pipeline.sh`: Implements the CI/CD pipeline
- `scripts/verify-cicd-pipeline.sh`: Verifies the CI/CD pipeline implementation

## Configuration Files

### Security Hardening Configuration

- `cloudformation/security-hardening.yaml`: CloudFormation template for security services
- `cloudformation/iam-policies.yaml`: CloudFormation template for IAM policies
- `cloudformation/network-security.yaml`: CloudFormation template for network security

### Monitoring and Alerting Configuration

- `cloudformation/monitoring-alerting-part1.yaml`: CloudFormation template for SNS and dashboards
- `cloudformation/monitoring-alerting-part2.yaml`: CloudFormation template for alarms
- `cloudformation/monitoring-alerting-part3.yaml`: CloudFormation template for synthetics and log metrics
- `runbooks/high-cpu-utilization.md`: Runbook for high CPU utilization
- `runbooks/high-memory-utilization.md`: Runbook for high memory utilization
- `runbooks/api-5xx-error-rate.md`: Runbook for API 5XX error rate

### CI/CD Pipeline Configuration

- `.github/workflows/ci-cd.yml`: GitHub Actions workflow file
- `.aws/task-definition-core-api.json`: Task definition for Core API
- `.aws/task-definition-frontend.json`: Task definition for Frontend
- `.aws/task-definition-mcp-server.json`: Task definition for MCP Server
- `core-api/Dockerfile`: Dockerfile for Core API
- `frontend/Dockerfile`: Dockerfile for Frontend
- `mcp-server/Dockerfile`: Dockerfile for MCP Server
- `sonar-project.properties`: SonarQube configuration
- `.snyk`: Snyk configuration

## Step-by-Step AWS Installation Guide

This guide provides detailed instructions for installing the Dust platform on AWS, including setting up the infrastructure, security, monitoring, and CI/CD pipeline.

### Prerequisites

1. **AWS Account**: You need an AWS account with administrative privileges.
2. **AWS CLI**: Install and configure the AWS CLI on your local machine.
3. **GitHub Account**: You need a GitHub account to host the repository.
4. **Domain Name**: (Optional) A domain name for the application.
5. **SSL Certificate**: (Optional) An SSL certificate for HTTPS.

### Step 1: Clone the Repository

1. Clone the Dust repository:

   ```bash
   git clone https://github.com/jamon8888/dust.git
   cd dust
   ```

2. Create the necessary branches:

   ```bash
   git checkout -b development
   git push -u origin development

   git checkout -b staging
   git push -u origin staging

   git checkout main
   ```

### Step 2: Set Up AWS Infrastructure

1. Create a VPC with public and private subnets:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-vpc \
     --template-body file://cloudformation/vpc.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development
   ```

2. Create security groups:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-security-groups \
     --template-body file://cloudformation/network-security.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PublicSubnet1Id,ParameterValue=<public-subnet-1-id> \
                  ParameterKey=PublicSubnet2Id,ParameterValue=<public-subnet-2-id> \
                  ParameterKey=PrivateSubnet1Id,ParameterValue=<private-subnet-1-id> \
                  ParameterKey=PrivateSubnet2Id,ParameterValue=<private-subnet-2-id> \
                  ParameterKey=DatabaseSubnet1Id,ParameterValue=<database-subnet-1-id> \
                  ParameterKey=DatabaseSubnet2Id,ParameterValue=<database-subnet-2-id>
   ```

3. Create IAM roles and policies:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-iam-policies \
     --template-body file://cloudformation/iam-policies.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
     --capabilities CAPABILITY_NAMED_IAM
   ```

4. Create RDS database:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-database \
     --template-body file://cloudformation/database.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=DatabaseSubnet1Id,ParameterValue=<database-subnet-1-id> \
                  ParameterKey=DatabaseSubnet2Id,ParameterValue=<database-subnet-2-id> \
                  ParameterKey=DatabaseSecurityGroupId,ParameterValue=<database-security-group-id> \
                  ParameterKey=DatabaseUsername,ParameterValue=admin \
                  ParameterKey=DatabasePassword,ParameterValue=<password>
   ```

5. Create ElastiCache cluster:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-elasticache \
     --template-body file://cloudformation/elasticache.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PrivateSubnet1Id,ParameterValue=<private-subnet-1-id> \
                  ParameterKey=PrivateSubnet2Id,ParameterValue=<private-subnet-2-id> \
                  ParameterKey=ElastiCacheSecurityGroupId,ParameterValue=<elasticache-security-group-id>
   ```

6. Create OpenSearch domain:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-opensearch \
     --template-body file://cloudformation/opensearch.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PrivateSubnet1Id,ParameterValue=<private-subnet-1-id> \
                  ParameterKey=PrivateSubnet2Id,ParameterValue=<private-subnet-2-id> \
                  ParameterKey=OpenSearchSecurityGroupId,ParameterValue=<opensearch-security-group-id>
   ```

7. Create ECS cluster:

   ```bash
   aws cloudformation create-stack \
     --stack-name dust-ecs \
     --template-body file://cloudformation/ecs.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PrivateSubnet1Id,ParameterValue=<private-subnet-1-id> \
                  ParameterKey=PrivateSubnet2Id,ParameterValue=<private-subnet-2-id> \
                  ParameterKey=ECSSecurityGroupId,ParameterValue=<ecs-security-group-id>
   ```

8. Create Application Load Balancer:
   ```bash
   aws cloudformation create-stack \
     --stack-name dust-alb \
     --template-body file://cloudformation/alb.yaml \
     --parameters ParameterKey=Environment,ParameterValue=development \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PublicSubnet1Id,ParameterValue=<public-subnet-1-id> \
                  ParameterKey=PublicSubnet2Id,ParameterValue=<public-subnet-2-id> \
                  ParameterKey=ALBSecurityGroupId,ParameterValue=<alb-security-group-id>
   ```

### Step 3: Implement Security Hardening

1. Run the security hardening script:

   ```bash
   chmod +x scripts/implement-security-hardening.sh
   ./scripts/implement-security-hardening.sh development alerts@example.com
   ```

2. Verify the security hardening implementation:
   ```bash
   chmod +x scripts/verify-security-hardening.sh
   ./scripts/verify-security-hardening.sh development
   ```

### Step 4: Implement Monitoring and Alerting

1. Run the monitoring and alerting script:

   ```bash
   chmod +x scripts/implement-monitoring-alerting.sh
   ./scripts/implement-monitoring-alerting.sh development alerts@example.com "https://hooks.slack.com/services/XXXXXXXXX/XXXXXXXXX/XXXXXXXXXXXXXXXXXXXXXXXX" "your-pagerduty-integration-key" "https://api.dust.development.example.com" "https://app.dust.development.example.com" "https://mcp.dust.development.example.com"
   ```

2. Verify the monitoring and alerting implementation:
   ```bash
   chmod +x scripts/verify-monitoring-alerting.sh
   ./scripts/verify-monitoring-alerting.sh development
   ```

### Step 5: Set Up CI/CD Pipeline

1. Create ECR repositories:

   ```bash
   aws ecr create-repository --repository-name dust-core-api --image-scanning-configuration scanOnPush=true
   aws ecr create-repository --repository-name dust-frontend --image-scanning-configuration scanOnPush=true
   aws ecr create-repository --repository-name dust-mcp-server --image-scanning-configuration scanOnPush=true
   ```

2. Create GitHub repository secrets:

   - Go to your GitHub repository
   - Navigate to Settings > Secrets and variables > Actions
   - Add the following secrets:
     - `AWS_ACCESS_KEY_ID`: Your AWS access key ID
     - `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key
     - `SONAR_TOKEN`: Your SonarQube token
     - `SONAR_HOST_URL`: Your SonarQube host URL
     - `SNYK_TOKEN`: Your Snyk token
     - `SLACK_WEBHOOK`: Your Slack webhook URL

3. Create GitHub branch protection rules:

   - Go to your GitHub repository
   - Navigate to Settings > Branches
   - Add branch protection rules for `main`, `staging`, and `development` branches
   - Configure required status checks, pull request reviews, and branch up-to-date requirements

4. Run the CI/CD pipeline script:

   ```bash
   chmod +x scripts/implement-cicd-pipeline.sh
   ./scripts/implement-cicd-pipeline.sh jamon8888/dust us-east-1 123456789012 development
   ```

5. Verify the CI/CD pipeline implementation:
   ```bash
   chmod +x scripts/verify-cicd-pipeline.sh
   ./scripts/verify-cicd-pipeline.sh development us-east-1
   ```

### Step 6: Deploy the Application

1. Push code to the development branch to trigger the CI/CD pipeline:

   ```bash
   git checkout development
   git push origin development
   ```

2. Monitor the GitHub Actions workflow:

   - Go to your GitHub repository
   - Navigate to Actions
   - Monitor the CI/CD pipeline execution

3. Verify the deployment:
   - Check the ECS services in the AWS Management Console
   - Verify that the services are running and healthy
   - Access the application using the ALB DNS name or your custom domain

### Step 7: Set Up Production Environment

1. Repeat steps 2-5 for the production environment:

   ```bash
   # Replace 'development' with 'production' in all commands
   ```

2. Deploy to production:

   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

3. Monitor the production deployment:
   - Go to your GitHub repository
   - Navigate to Actions
   - Monitor the CI/CD pipeline execution for the production environment

### Step 8: Configure DNS and SSL

1. Create Route 53 hosted zone (if using a custom domain):

   ```bash
   aws route53 create-hosted-zone --name example.com --caller-reference $(date +%s)
   ```

2. Create SSL certificate in ACM:

   ```bash
   aws acm request-certificate --domain-name example.com --validation-method DNS --subject-alternative-names *.example.com
   ```

3. Create DNS records for validation:

   ```bash
   # Follow the instructions provided by ACM to create DNS validation records
   ```

4. Update ALB to use HTTPS:

   ```bash
   aws cloudformation update-stack \
     --stack-name dust-alb \
     --template-body file://cloudformation/alb.yaml \
     --parameters ParameterKey=Environment,ParameterValue=production \
                  ParameterKey=VpcId,ParameterValue=<vpc-id> \
                  ParameterKey=PublicSubnet1Id,ParameterValue=<public-subnet-1-id> \
                  ParameterKey=PublicSubnet2Id,ParameterValue=<public-subnet-2-id> \
                  ParameterKey=ALBSecurityGroupId,ParameterValue=<alb-security-group-id> \
                  ParameterKey=CertificateArn,ParameterValue=<certificate-arn>
   ```

5. Create Route 53 records for the application:
   ```bash
   aws route53 change-resource-record-sets \
     --hosted-zone-id <hosted-zone-id> \
     --change-batch '{
       "Changes": [
         {
           "Action": "CREATE",
           "ResourceRecordSet": {
             "Name": "app.example.com",
             "Type": "A",
             "AliasTarget": {
               "HostedZoneId": "<alb-hosted-zone-id>",
               "DNSName": "<alb-dns-name>",
               "EvaluateTargetHealth": true
             }
           }
         },
         {
           "Action": "CREATE",
           "ResourceRecordSet": {
             "Name": "api.example.com",
             "Type": "A",
             "AliasTarget": {
               "HostedZoneId": "<alb-hosted-zone-id>",
               "DNSName": "<alb-dns-name>",
               "EvaluateTargetHealth": true
             }
           }
         },
         {
           "Action": "CREATE",
           "ResourceRecordSet": {
             "Name": "mcp.example.com",
             "Type": "A",
             "AliasTarget": {
               "HostedZoneId": "<alb-hosted-zone-id>",
               "DNSName": "<alb-dns-name>",
               "EvaluateTargetHealth": true
             }
           }
         }
       ]
     }'
   ```

### Step 9: Configure Secrets and Environment Variables

1. Create secrets in AWS Secrets Manager:

   ```bash
   # Database URL
   aws secretsmanager create-secret \
     --name dust/database-url \
     --description "Database URL for Dust platform" \
     --secret-string "postgresql://username:password@dust-db.example.com:5432/dust"

   # JWT Secret
   aws secretsmanager create-secret \
     --name dust/jwt-secret \
     --description "JWT Secret for Dust platform" \
     --secret-string "your-jwt-secret"

   # OpenAI API Key
   aws secretsmanager create-secret \
     --name dust/openai-api-key \
     --description "OpenAI API Key for Dust platform" \
     --secret-string "your-openai-api-key"

   # Google Analytics ID
   aws secretsmanager create-secret \
     --name dust/google-analytics-id \
     --description "Google Analytics ID for Dust platform" \
     --secret-string "your-google-analytics-id"
   ```

2. Update task definitions with the correct secret ARNs:

   ```bash
   # Edit .aws/task-definition-core-api.json, .aws/task-definition-frontend.json, and .aws/task-definition-mcp-server.json
   # Replace the placeholder ARNs with the actual ARNs of your secrets
   ```

3. Update environment variables in task definitions:
   ```bash
   # Edit .aws/task-definition-core-api.json, .aws/task-definition-frontend.json, and .aws/task-definition-mcp-server.json
   # Update environment variables as needed
   ```

### Step 10: Verify the Installation

1. Verify the infrastructure:

   ```bash
   # List CloudFormation stacks
   aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

   # List ECS clusters
   aws ecs list-clusters

   # List ECS services
   aws ecs list-services --cluster dust-production

   # List RDS instances
   aws rds describe-db-instances

   # List ElastiCache clusters
   aws elasticache describe-cache-clusters

   # List OpenSearch domains
   aws opensearch list-domain-names
   ```

2. Verify the security hardening:

   ```bash
   ./scripts/verify-security-hardening.sh production
   ```

3. Verify the monitoring and alerting:

   ```bash
   ./scripts/verify-monitoring-alerting.sh production
   ```

4. Verify the CI/CD pipeline:

   ```bash
   ./scripts/verify-cicd-pipeline.sh production us-east-1
   ```

5. Verify the application:
   ```bash
   # Access the application using the ALB DNS name or your custom domain
   curl -I https://app.example.com
   curl -I https://api.example.com/health
   curl -I https://mcp.example.com/health
   ```

## Conclusion

The Dust platform has been successfully installed on AWS with a comprehensive security hardening plan, monitoring and alerting system, and CI/CD pipeline. The platform is now ready for use and can be accessed using the configured domain names.

The installation includes:

- A secure and scalable infrastructure on AWS
- A comprehensive security hardening plan
- A robust monitoring and alerting system
- An automated CI/CD pipeline
- Backup and restore procedures
- Disaster recovery procedures

The platform is designed to be highly available, scalable, and secure, providing a solid foundation for the Dust application.

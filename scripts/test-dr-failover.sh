#!/bin/bash

# This script tests the disaster recovery failover process

echo "Testing disaster recovery failover..."

# Set variables
PRIMARY_REGION=${1:-us-east-1}
SECONDARY_REGION=${2:-us-west-2}
ENVIRONMENT=${3:-dev}
DOMAIN_NAME=${4:-dust.example.com}

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

# Check if the secondary region is set up
echo "Checking if the secondary region is set up..."
if ! aws rds describe-db-instances --region $SECONDARY_REGION --query "DBInstances[?DBInstanceIdentifier=='dust-db-replica-${ENVIRONMENT}']" --output text &> /dev/null; then
  echo "Secondary region is not set up. Please set it up first."
  exit 1
fi

# Start the test
echo "Starting disaster recovery failover test..."

# Simulate primary region failure by updating Route 53 health check
echo "Simulating primary region failure..."
HEALTH_CHECK_ID=$(aws route53 list-health-checks --region $PRIMARY_REGION --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='api.${ENVIRONMENT}.${DOMAIN_NAME}'].Id" --output text)

if [ -z "$HEALTH_CHECK_ID" ]; then
  echo "Health check not found. Please check the domain name."
  exit 1
fi

echo "Found health check ID: $HEALTH_CHECK_ID"

# Disable the health check temporarily
echo "Disabling health check..."
aws route53 update-health-check --health-check-id $HEALTH_CHECK_ID --disabled --region $PRIMARY_REGION

# Wait for DNS failover
echo "Waiting for DNS failover (60 seconds)..."
sleep 60

# Verify DNS failover
echo "Verifying DNS failover..."
PRIMARY_DNS=$(dig +short ${ENVIRONMENT}.${DOMAIN_NAME})
echo "Current DNS for ${ENVIRONMENT}.${DOMAIN_NAME}: $PRIMARY_DNS"

# Check if the DNS points to the secondary region
if [[ $PRIMARY_DNS == *"$SECONDARY_REGION"* ]]; then
  echo "✅ DNS failover successful! DNS now points to the secondary region."
else
  echo "❌ DNS failover failed. DNS still points to the primary region."
  
  # Re-enable the health check
  echo "Re-enabling health check..."
  aws route53 update-health-check --health-check-id $HEALTH_CHECK_ID --no-disabled --region $PRIMARY_REGION
  
  exit 1
fi

# Verify application in secondary region
echo "Verifying application in secondary region..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.${ENVIRONMENT}.${DOMAIN_NAME}/health)

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "✅ Application is healthy in the secondary region!"
else
  echo "❌ Application is not healthy in the secondary region. HTTP status: $HTTP_STATUS"
fi

# Promote RDS read replica to primary
echo "Promoting RDS read replica to primary..."
aws rds promote-read-replica \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION

# Wait for RDS promotion to complete
echo "Waiting for RDS promotion to complete..."
aws rds wait db-instance-available \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION

echo "RDS promotion completed!"

# Verify database connectivity
echo "Verifying database connectivity..."
DB_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --region $SECONDARY_REGION \
  --query "DBInstances[0].DBInstanceStatus" \
  --output text)

if [ "$DB_STATUS" == "available" ]; then
  echo "✅ Database is available in the secondary region!"
else
  echo "❌ Database is not available in the secondary region. Status: $DB_STATUS"
fi

# Test complete
echo "Disaster recovery failover test completed!"

# Cleanup
echo "Cleaning up..."

# Re-enable the health check
echo "Re-enabling health check..."
aws route53 update-health-check --health-check-id $HEALTH_CHECK_ID --no-disabled --region $PRIMARY_REGION

echo "Waiting for DNS to revert back to primary region (60 seconds)..."
sleep 60

# Verify DNS failback
echo "Verifying DNS failback..."
PRIMARY_DNS=$(dig +short ${ENVIRONMENT}.${DOMAIN_NAME})
echo "Current DNS for ${ENVIRONMENT}.${DOMAIN_NAME}: $PRIMARY_DNS"

# Check if the DNS points back to the primary region
if [[ $PRIMARY_DNS == *"$PRIMARY_REGION"* ]]; then
  echo "✅ DNS failback successful! DNS now points back to the primary region."
else
  echo "❌ DNS failback failed. DNS still points to the secondary region."
fi

echo "Test cleanup completed!"

# Create a new RDS read replica in the secondary region
echo "Creating a new RDS read replica in the secondary region..."
aws rds create-db-instance-read-replica \
  --db-instance-identifier dust-db-replica-${ENVIRONMENT} \
  --source-db-instance-identifier arn:aws:rds:${PRIMARY_REGION}:$(aws sts get-caller-identity --query "Account" --output text):db:dust-db-${ENVIRONMENT} \
  --db-instance-class db.t3.medium \
  --availability-zone ${SECONDARY_REGION}a \
  --region $SECONDARY_REGION

echo "New RDS read replica creation initiated. This will take some time to complete."
echo "You can check the status with: aws rds describe-db-instances --db-instance-identifier dust-db-replica-${ENVIRONMENT} --region $SECONDARY_REGION"

echo "Disaster recovery failover test script completed!"
chmod +x scripts/test-dr-failover.sh

#!/bin/bash

# This script verifies the security hardening plan

echo "Verifying security hardening plan..."

# Set variables
ENVIRONMENT=${1:-dev}

# Check CloudFormation stacks
echo "Checking CloudFormation stacks..."
if aws cloudformation describe-stacks --stack-name security-hardening-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Security hardening CloudFormation stack exists"
else
  echo "❌ Security hardening CloudFormation stack does not exist"
fi

if aws cloudformation describe-stacks --stack-name iam-policies-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ IAM policies CloudFormation stack exists"
else
  echo "❌ IAM policies CloudFormation stack does not exist"
fi

if aws cloudformation describe-stacks --stack-name network-security-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Network security CloudFormation stack exists"
else
  echo "❌ Network security CloudFormation stack does not exist"
fi

# Check AWS Security Services
echo "Checking AWS Security Services..."

# Check CloudTrail
if aws cloudtrail describe-trails --query "trailList[?Name=='dust-cloudtrail-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ CloudTrail is enabled"
  
  # Check CloudTrail configuration
  MULTI_REGION=$(aws cloudtrail describe-trails --query "trailList[?Name=='dust-cloudtrail-${ENVIRONMENT}'].IsMultiRegionTrail" --output text)
  LOG_VALIDATION=$(aws cloudtrail describe-trails --query "trailList[?Name=='dust-cloudtrail-${ENVIRONMENT}'].LogFileValidationEnabled" --output text)
  
  if [ "$MULTI_REGION" == "True" ]; then
    echo "  ✅ CloudTrail is multi-region"
  else
    echo "  ❌ CloudTrail is not multi-region"
  fi
  
  if [ "$LOG_VALIDATION" == "True" ]; then
    echo "  ✅ CloudTrail log file validation is enabled"
  else
    echo "  ❌ CloudTrail log file validation is not enabled"
  fi
else
  echo "❌ CloudTrail is not enabled"
fi

# Check AWS Config
if aws configservice describe-configuration-recorders --query "ConfigurationRecorders[?name=='dust-config-recorder-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ AWS Config is enabled"
  
  # Check AWS Config configuration
  ALL_SUPPORTED=$(aws configservice describe-configuration-recorders --query "ConfigurationRecorders[?name=='dust-config-recorder-${ENVIRONMENT}'].recordingGroup.allSupported" --output text)
  GLOBAL_RESOURCES=$(aws configservice describe-configuration-recorders --query "ConfigurationRecorders[?name=='dust-config-recorder-${ENVIRONMENT}'].recordingGroup.includeGlobalResourceTypes" --output text)
  
  if [ "$ALL_SUPPORTED" == "True" ]; then
    echo "  ✅ AWS Config is recording all supported resources"
  else
    echo "  ❌ AWS Config is not recording all supported resources"
  fi
  
  if [ "$GLOBAL_RESOURCES" == "True" ]; then
    echo "  ✅ AWS Config is recording global resources"
  else
    echo "  ❌ AWS Config is not recording global resources"
  fi
else
  echo "❌ AWS Config is not enabled"
fi

# Check GuardDuty
if aws guardduty list-detectors --query "DetectorIds" --output text > /dev/null 2>&1; then
  echo "✅ GuardDuty is enabled"
else
  echo "❌ GuardDuty is not enabled"
fi

# Check Security Hub
if aws securityhub describe-hub --query "HubArn" --output text > /dev/null 2>&1; then
  echo "✅ Security Hub is enabled"
  
  # Check Security Hub standards
  CIS_STANDARD=$(aws securityhub get-enabled-standards --query "StandardsSubscriptions[?StandardsArn=='arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0']" --output text 2>/dev/null || echo "")
  PCI_STANDARD=$(aws securityhub get-enabled-standards --query "StandardsSubscriptions[?StandardsArn=='arn:aws:securityhub:::ruleset/pci-dss/v/3.2.1']" --output text 2>/dev/null || echo "")
  AWS_STANDARD=$(aws securityhub get-enabled-standards --query "StandardsSubscriptions[?StandardsArn=='arn:aws:securityhub:::ruleset/aws-foundational-security-best-practices/v/1.0.0']" --output text 2>/dev/null || echo "")
  
  if [ -n "$CIS_STANDARD" ]; then
    echo "  ✅ CIS AWS Foundations Benchmark standard is enabled"
  else
    echo "  ❌ CIS AWS Foundations Benchmark standard is not enabled"
  fi
  
  if [ -n "$PCI_STANDARD" ]; then
    echo "  ✅ PCI DSS standard is enabled"
  else
    echo "  ❌ PCI DSS standard is not enabled"
  fi
  
  if [ -n "$AWS_STANDARD" ]; then
    echo "  ✅ AWS Foundational Security Best Practices standard is enabled"
  else
    echo "  ❌ AWS Foundational Security Best Practices standard is not enabled"
  fi
else
  echo "❌ Security Hub is not enabled"
fi

# Check Inspector
if aws inspector describe-assessment-templates --query "assessmentTemplateArns" --output text > /dev/null 2>&1; then
  echo "✅ Inspector is enabled"
else
  echo "❌ Inspector is not enabled"
fi

# Check Macie
if aws macie2 get-macie-session --query "status" --output text > /dev/null 2>&1; then
  echo "✅ Macie is enabled"
else
  echo "❌ Macie is not enabled"
fi

# Check Detective
if aws detective list-graphs --query "GraphList[*].Arn" --output text > /dev/null 2>&1; then
  echo "✅ Detective is enabled"
else
  echo "❌ Detective is not enabled"
fi

# Check IAM
echo "Checking IAM..."

# Check password policy
if aws iam get-account-password-policy > /dev/null 2>&1; then
  echo "✅ IAM password policy is configured"
  
  # Check password policy configuration
  MIN_LENGTH=$(aws iam get-account-password-policy --query "PasswordPolicy.MinimumPasswordLength" --output text)
  REQUIRE_SYMBOLS=$(aws iam get-account-password-policy --query "PasswordPolicy.RequireSymbols" --output text)
  REQUIRE_NUMBERS=$(aws iam get-account-password-policy --query "PasswordPolicy.RequireNumbers" --output text)
  REQUIRE_UPPERCASE=$(aws iam get-account-password-policy --query "PasswordPolicy.RequireUppercaseCharacters" --output text)
  REQUIRE_LOWERCASE=$(aws iam get-account-password-policy --query "PasswordPolicy.RequireLowercaseCharacters" --output text)
  PASSWORD_REUSE=$(aws iam get-account-password-policy --query "PasswordPolicy.PasswordReusePrevention" --output text 2>/dev/null || echo "0")
  MAX_AGE=$(aws iam get-account-password-policy --query "PasswordPolicy.MaxPasswordAge" --output text 2>/dev/null || echo "0")
  
  if [ "$MIN_LENGTH" -ge 14 ]; then
    echo "  ✅ Minimum password length is at least 14 characters"
  else
    echo "  ❌ Minimum password length is less than 14 characters"
  fi
  
  if [ "$REQUIRE_SYMBOLS" == "True" ]; then
    echo "  ✅ Password requires symbols"
  else
    echo "  ❌ Password does not require symbols"
  fi
  
  if [ "$REQUIRE_NUMBERS" == "True" ]; then
    echo "  ✅ Password requires numbers"
  else
    echo "  ❌ Password does not require numbers"
  fi
  
  if [ "$REQUIRE_UPPERCASE" == "True" ]; then
    echo "  ✅ Password requires uppercase characters"
  else
    echo "  ❌ Password does not require uppercase characters"
  fi
  
  if [ "$REQUIRE_LOWERCASE" == "True" ]; then
    echo "  ✅ Password requires lowercase characters"
  else
    echo "  ❌ Password does not require lowercase characters"
  fi
  
  if [ "$PASSWORD_REUSE" -ge 24 ]; then
    echo "  ✅ Password reuse prevention is at least 24 passwords"
  else
    echo "  ❌ Password reuse prevention is less than 24 passwords"
  fi
  
  if [ "$MAX_AGE" -gt 0 ] && [ "$MAX_AGE" -le 90 ]; then
    echo "  ✅ Maximum password age is 90 days or less"
  else
    echo "  ❌ Maximum password age is not configured or greater than 90 days"
  fi
else
  echo "❌ IAM password policy is not configured"
fi

# Check MFA for root account
ROOT_MFA=$(aws iam get-account-summary --query "SummaryMap.AccountMFAEnabled" --output text)
if [ "$ROOT_MFA" == "1" ]; then
  echo "✅ MFA is enabled for root account"
else
  echo "❌ MFA is not enabled for root account"
fi

# Check MFA for IAM users
IAM_USERS=$(aws iam list-users --query "Users[*].UserName" --output text)
for USER in $IAM_USERS; do
  MFA_DEVICES=$(aws iam list-mfa-devices --user-name $USER --query "MFADevices[*]" --output text)
  if [ -z "$MFA_DEVICES" ]; then
    echo "❌ MFA not enabled for user: $USER"
  else
    echo "✅ MFA enabled for user: $USER"
  fi
done

# Check IAM groups
if aws iam list-groups --query "Groups[?GroupName=='dust-developers-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ Developers IAM group exists"
else
  echo "❌ Developers IAM group does not exist"
fi

if aws iam list-groups --query "Groups[?GroupName=='dust-operations-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ Operations IAM group exists"
else
  echo "❌ Operations IAM group does not exist"
fi

if aws iam list-groups --query "Groups[?GroupName=='dust-security-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ Security IAM group exists"
else
  echo "❌ Security IAM group does not exist"
fi

if aws iam list-groups --query "Groups[?GroupName=='dust-readonly-${ENVIRONMENT}']" --output text > /dev/null 2>&1; then
  echo "✅ Read-only IAM group exists"
else
  echo "❌ Read-only IAM group does not exist"
fi

# Check S3 buckets
echo "Checking S3 buckets..."
S3_BUCKETS=$(aws s3api list-buckets --query "Buckets[*].Name" --output text)
for BUCKET in $S3_BUCKETS; do
  if [[ $BUCKET == *"dust"* ]] && [[ $BUCKET == *"$ENVIRONMENT"* ]]; then
    echo "Checking bucket: $BUCKET"
    
    # Check encryption
    ENCRYPTION=$(aws s3api get-bucket-encryption --bucket $BUCKET --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" --output text 2>/dev/null || echo "")
    if [ -n "$ENCRYPTION" ]; then
      echo "  ✅ Encryption is enabled"
    else
      echo "  ❌ Encryption is not enabled"
    fi
    
    # Check public access block
    PUBLIC_ACCESS_BLOCK=$(aws s3api get-public-access-block --bucket $BUCKET --query "PublicAccessBlockConfiguration" --output text 2>/dev/null || echo "")
    if [ -n "$PUBLIC_ACCESS_BLOCK" ]; then
      echo "  ✅ Public access block is configured"
    else
      echo "  ❌ Public access block is not configured"
    fi
    
    # Check bucket policy
    BUCKET_POLICY=$(aws s3api get-bucket-policy --bucket $BUCKET --query "Policy" --output text 2>/dev/null || echo "")
    if [ -n "$BUCKET_POLICY" ]; then
      if [[ $BUCKET_POLICY == *"aws:SecureTransport"* ]]; then
        echo "  ✅ Bucket policy enforces HTTPS"
      else
        echo "  ❌ Bucket policy does not enforce HTTPS"
      fi
    else
      echo "  ❌ Bucket policy is not configured"
    fi
  fi
done

# Check RDS instances
echo "Checking RDS instances..."
RDS_INSTANCES=$(aws rds describe-db-instances --query "DBInstances[*].DBInstanceIdentifier" --output text)
for INSTANCE in $RDS_INSTANCES; do
  if [[ $INSTANCE == *"dust"* ]] && [[ $INSTANCE == *"$ENVIRONMENT"* ]]; then
    echo "Checking RDS instance: $INSTANCE"
    
    # Check encryption
    ENCRYPTION_ENABLED=$(aws rds describe-db-instances --db-instance-identifier $INSTANCE --query "DBInstances[0].StorageEncrypted" --output text)
    if [ "$ENCRYPTION_ENABLED" == "True" ]; then
      echo "  ✅ Encryption is enabled"
    else
      echo "  ❌ Encryption is not enabled"
    fi
    
    # Check public accessibility
    PUBLIC_ACCESSIBLE=$(aws rds describe-db-instances --db-instance-identifier $INSTANCE --query "DBInstances[0].PubliclyAccessible" --output text)
    if [ "$PUBLIC_ACCESSIBLE" == "False" ]; then
      echo "  ✅ Not publicly accessible"
    else
      echo "  ❌ Publicly accessible"
    fi
    
    # Check backup retention
    BACKUP_RETENTION=$(aws rds describe-db-instances --db-instance-identifier $INSTANCE --query "DBInstances[0].BackupRetentionPeriod" --output text)
    if [ "$BACKUP_RETENTION" -gt 0 ]; then
      echo "  ✅ Backup retention is enabled"
    else
      echo "  ❌ Backup retention is not enabled"
    fi
  fi
done

# Check EBS volumes
echo "Checking EBS volumes..."
EBS_VOLUMES=$(aws ec2 describe-volumes --query "Volumes[*].VolumeId" --output text)
for VOLUME in $EBS_VOLUMES; do
  echo "Checking EBS volume: $VOLUME"
  
  # Check encryption
  ENCRYPTION_ENABLED=$(aws ec2 describe-volumes --volume-ids $VOLUME --query "Volumes[0].Encrypted" --output text)
  if [ "$ENCRYPTION_ENABLED" == "True" ]; then
    echo "  ✅ Encryption is enabled"
  else
    echo "  ❌ Encryption is not enabled"
  fi
done

# Check ElastiCache clusters
echo "Checking ElastiCache clusters..."
ELASTICACHE_CLUSTERS=$(aws elasticache describe-cache-clusters --query "CacheClusters[*].CacheClusterId" --output text)
for CLUSTER in $ELASTICACHE_CLUSTERS; do
  if [[ $CLUSTER == *"dust"* ]] && [[ $CLUSTER == *"$ENVIRONMENT"* ]]; then
    echo "Checking ElastiCache cluster: $CLUSTER"
    
    # Check encryption
    ENCRYPTION_ENABLED=$(aws elasticache describe-cache-clusters --cache-cluster-id $CLUSTER --show-cache-node-info --query "CacheClusters[0].TransitEncryptionEnabled" --output text 2>/dev/null || echo "false")
    if [ "$ENCRYPTION_ENABLED" == "True" ]; then
      echo "  ✅ Encryption is enabled"
    else
      echo "  ❌ Encryption is not enabled"
    fi
  fi
done

# Check OpenSearch domains
echo "Checking OpenSearch domains..."
OPENSEARCH_DOMAINS=$(aws opensearch list-domain-names --query "DomainNames[*].DomainName" --output text)
for DOMAIN in $OPENSEARCH_DOMAINS; do
  if [[ $DOMAIN == *"dust"* ]] && [[ $DOMAIN == *"$ENVIRONMENT"* ]]; then
    echo "Checking OpenSearch domain: $DOMAIN"
    
    # Check encryption
    ENCRYPTION_ENABLED=$(aws opensearch describe-domain --domain-name $DOMAIN --query "DomainStatus.EncryptionAtRestOptions.Enabled" --output text)
    if [ "$ENCRYPTION_ENABLED" == "True" ]; then
      echo "  ✅ Encryption is enabled"
    else
      echo "  ❌ Encryption is not enabled"
    fi
    
    # Check node-to-node encryption
    NODE_ENCRYPTION=$(aws opensearch describe-domain --domain-name $DOMAIN --query "DomainStatus.NodeToNodeEncryptionOptions.Enabled" --output text)
    if [ "$NODE_ENCRYPTION" == "True" ]; then
      echo "  ✅ Node-to-node encryption is enabled"
    else
      echo "  ❌ Node-to-node encryption is not enabled"
    fi
    
    # Check HTTPS enforcement
    HTTPS_REQUIRED=$(aws opensearch describe-domain --domain-name $DOMAIN --query "DomainStatus.DomainEndpointOptions.EnforceHTTPS" --output text)
    if [ "$HTTPS_REQUIRED" == "True" ]; then
      echo "  ✅ HTTPS is enforced"
    else
      echo "  ❌ HTTPS is not enforced"
    fi
  fi
done

# Check WAF
echo "Checking WAF..."
WAF_WEB_ACL_ID=$(aws cloudformation describe-stacks --stack-name network-security-${ENVIRONMENT} --query "Stacks[0].Outputs[?OutputKey=='WAFWebACL'].OutputValue" --output text 2>/dev/null || echo "")
if [ -n "$WAF_WEB_ACL_ID" ]; then
  echo "✅ WAF Web ACL exists"
  
  # Check WAF association with ALB
  ALB_ARN=$(aws elbv2 describe-load-balancers --names dust-alb-${ENVIRONMENT} --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null || echo "")
  if [ -n "$ALB_ARN" ]; then
    WAF_ASSOCIATION=$(aws wafv2 get-web-acl-for-resource --resource-arn $ALB_ARN --query "WebACL.ARN" --output text 2>/dev/null || echo "")
    if [ -n "$WAF_ASSOCIATION" ]; then
      echo "  ✅ WAF is associated with ALB"
    else
      echo "  ❌ WAF is not associated with ALB"
    fi
  else
    echo "  ❌ ALB not found"
  fi
else
  echo "❌ WAF Web ACL does not exist"
fi

# Check Shield Advanced
echo "Checking Shield Advanced..."
SHIELD_SUBSCRIPTION=$(aws shield describe-subscription --query "Subscription.SubscriptionArn" --output text 2>/dev/null || echo "")
if [ -n "$SHIELD_SUBSCRIPTION" ]; then
  echo "✅ Shield Advanced is enabled"
  
  # Check Shield protection for ALB
  ALB_ARN=$(aws elbv2 describe-load-balancers --names dust-alb-${ENVIRONMENT} --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null || echo "")
  if [ -n "$ALB_ARN" ]; then
    SHIELD_PROTECTION=$(aws shield list-protections --query "Protections[?ResourceArn=='$ALB_ARN']" --output text 2>/dev/null || echo "")
    if [ -n "$SHIELD_PROTECTION" ]; then
      echo "  ✅ Shield protection is enabled for ALB"
    else
      echo "  ❌ Shield protection is not enabled for ALB"
    fi
  else
    echo "  ❌ ALB not found"
  fi
else
  echo "❌ Shield Advanced is not enabled"
fi

# Check VPC Flow Logs
echo "Checking VPC Flow Logs..."
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=dust-vpc-${ENVIRONMENT}" --query "Vpcs[0].VpcId" --output text 2>/dev/null || echo "")
if [ -n "$VPC_ID" ]; then
  FLOW_LOGS=$(aws ec2 describe-flow-logs --filter "Name=resource-id,Values=$VPC_ID" --query "FlowLogs[*].FlowLogId" --output text 2>/dev/null || echo "")
  if [ -n "$FLOW_LOGS" ]; then
    echo "✅ VPC Flow Logs are enabled"
  else
    echo "❌ VPC Flow Logs are not enabled"
  fi
else
  echo "❌ VPC not found"
fi

# Check Security Groups
echo "Checking Security Groups..."
if aws ec2 describe-security-groups --group-names dust-bastion-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ Bastion Security Group exists"
else
  echo "❌ Bastion Security Group does not exist"
fi

if aws ec2 describe-security-groups --group-names dust-alb-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ ALB Security Group exists"
else
  echo "❌ ALB Security Group does not exist"
fi

if aws ec2 describe-security-groups --group-names dust-ecs-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ ECS Security Group exists"
else
  echo "❌ ECS Security Group does not exist"
fi

if aws ec2 describe-security-groups --group-names dust-rds-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ RDS Security Group exists"
else
  echo "❌ RDS Security Group does not exist"
fi

if aws ec2 describe-security-groups --group-names dust-elasticache-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ ElastiCache Security Group exists"
else
  echo "❌ ElastiCache Security Group does not exist"
fi

if aws ec2 describe-security-groups --group-names dust-opensearch-sg-${ENVIRONMENT} > /dev/null 2>&1; then
  echo "✅ OpenSearch Security Group exists"
else
  echo "❌ OpenSearch Security Group does not exist"
fi

# Check Network ACLs
echo "Checking Network ACLs..."
if aws ec2 describe-network-acls --filters "Name=tag:Name,Values=dust-public-nacl-${ENVIRONMENT}" --query "NetworkAcls[*].NetworkAclId" --output text > /dev/null 2>&1; then
  echo "✅ Public Network ACL exists"
else
  echo "❌ Public Network ACL does not exist"
fi

if aws ec2 describe-network-acls --filters "Name=tag:Name,Values=dust-private-nacl-${ENVIRONMENT}" --query "NetworkAcls[*].NetworkAclId" --output text > /dev/null 2>&1; then
  echo "✅ Private Network ACL exists"
else
  echo "❌ Private Network ACL does not exist"
fi

if aws ec2 describe-network-acls --filters "Name=tag:Name,Values=dust-database-nacl-${ENVIRONMENT}" --query "NetworkAcls[*].NetworkAclId" --output text > /dev/null 2>&1; then
  echo "✅ Database Network ACL exists"
else
  echo "❌ Database Network ACL does not exist"
fi

# Check VPC Endpoints
echo "Checking VPC Endpoints..."
if aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$(aws configure get region).s3" --query "VpcEndpoints[*].VpcEndpointId" --output text > /dev/null 2>&1; then
  echo "✅ S3 VPC Endpoint exists"
else
  echo "❌ S3 VPC Endpoint does not exist"
fi

if aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=$VPC_ID" "Name=service-name,Values=com.amazonaws.$(aws configure get region).dynamodb" --query "VpcEndpoints[*].VpcEndpointId" --output text > /dev/null 2>&1; then
  echo "✅ DynamoDB VPC Endpoint exists"
else
  echo "❌ DynamoDB VPC Endpoint does not exist"
fi

echo "Security hardening plan verification completed!"
chmod +x scripts/verify-security-hardening.sh

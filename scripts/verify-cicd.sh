#!/bin/bash

# This script verifies the CI/CD pipeline

echo "Verifying CI/CD pipeline..."

# Check GitHub Actions workflows
echo "Checking GitHub Actions workflows..."
if [ -f .github/workflows/ci.yml ] && [ -f .github/workflows/cd.yml ]; then
  echo "✅ GitHub Actions workflows are present"
else
  echo "❌ GitHub Actions workflows are missing"
fi

# Check Docker configuration
echo "Checking Docker configuration..."
for service in core-api frontend mcp-server; do
  if [ -f services/$service/Dockerfile ]; then
    echo "✅ Dockerfile for $service is present"
  else
    echo "❌ Dockerfile for $service is missing"
  fi
done

# Check AWS CDK configuration
echo "Checking AWS CDK configuration..."
if [ -f cdk/lib/dust-stack.ts ] && [ -f cdk/bin/dust.ts ] && [ -f cdk/cdk.json ]; then
  echo "✅ AWS CDK configuration is present"
else
  echo "❌ AWS CDK configuration is missing"
fi

# Check GitHub repository configuration
echo "Checking GitHub repository configuration..."
if gh repo view > /dev/null 2>&1; then
  echo "✅ GitHub repository exists"
  
  # Check branch protection rules
  MAIN_PROTECTION=$(gh api repos/:owner/:repo/branches/main/protection --silent || echo "")
  DEVELOP_PROTECTION=$(gh api repos/:owner/:repo/branches/develop/protection --silent || echo "")
  
  if [ -n "$MAIN_PROTECTION" ]; then
    echo "✅ Branch protection for main is configured"
  else
    echo "❌ Branch protection for main is not configured"
  fi
  
  if [ -n "$DEVELOP_PROTECTION" ]; then
    echo "✅ Branch protection for develop is configured"
  else
    echo "❌ Branch protection for develop is not configured"
  fi
  
  # Check GitHub Actions secrets
  SECRETS=$(gh secret list --json name --jq '.[].name')
  
  if echo "$SECRETS" | grep -q "AWS_ACCESS_KEY_ID"; then
    echo "✅ AWS_ACCESS_KEY_ID secret is configured"
  else
    echo "❌ AWS_ACCESS_KEY_ID secret is not configured"
  fi
  
  if echo "$SECRETS" | grep -q "AWS_SECRET_ACCESS_KEY"; then
    echo "✅ AWS_SECRET_ACCESS_KEY secret is configured"
  else
    echo "❌ AWS_SECRET_ACCESS_KEY secret is not configured"
  fi
  
  if echo "$SECRETS" | grep -q "SNYK_TOKEN"; then
    echo "✅ SNYK_TOKEN secret is configured"
  else
    echo "❌ SNYK_TOKEN secret is not configured"
  fi
  
  if echo "$SECRETS" | grep -q "SLACK_WEBHOOK_URL"; then
    echo "✅ SLACK_WEBHOOK_URL secret is configured"
  else
    echo "❌ SLACK_WEBHOOK_URL secret is not configured"
  fi
else
  echo "❌ GitHub repository does not exist"
fi

# Check AWS ECR repositories
echo "Checking AWS ECR repositories..."
for repo in dust-core-api dust-frontend dust-mcp-server; do
  if aws ecr describe-repositories --repository-names $repo > /dev/null 2>&1; then
    echo "✅ ECR repository $repo exists"
  else
    echo "❌ ECR repository $repo does not exist"
  fi
done

# Check AWS CloudFormation stacks
echo "Checking AWS CloudFormation stacks..."
for stack in DustDevStack DustStagingStack DustProductionStack; do
  if aws cloudformation describe-stacks --stack-name $stack > /dev/null 2>&1; then
    echo "✅ CloudFormation stack $stack exists"
  else
    echo "❌ CloudFormation stack $stack does not exist"
  fi
done

# Check integration tests
echo "Checking integration tests..."
if [ -d tests/integration ] && [ -f tests/integration/api.test.js ]; then
  echo "✅ Integration tests are present"
else
  echo "❌ Integration tests are missing"
fi

# Check acceptance tests
echo "Checking acceptance tests..."
if [ -d tests/acceptance ] && [ -f tests/acceptance/cypress/integration/smoke.spec.js ]; then
  echo "✅ Acceptance tests are present"
else
  echo "❌ Acceptance tests are missing"
fi

# Check pull request template
echo "Checking pull request template..."
if [ -f .github/PULL_REQUEST_TEMPLATE/default.md ]; then
  echo "✅ Pull request template is present"
else
  echo "❌ Pull request template is missing"
fi

# Check CODEOWNERS file
echo "Checking CODEOWNERS file..."
if [ -f .github/CODEOWNERS ]; then
  echo "✅ CODEOWNERS file is present"
else
  echo "❌ CODEOWNERS file is missing"
fi

echo "CI/CD pipeline verification completed!"
chmod +x scripts/verify-cicd.sh

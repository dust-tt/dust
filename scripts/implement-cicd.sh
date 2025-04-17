#!/bin/bash

# This script implements the CI/CD pipeline

echo "Implementing CI/CD pipeline..."

# Create directories if they don't exist
mkdir -p .github/workflows
mkdir -p cdk/bin
mkdir -p cdk/lib
mkdir -p tests/integration
mkdir -p tests/acceptance

# Set up GitHub repository
echo "Setting up GitHub repository..."

# Create GitHub repository if it doesn't exist
if ! gh repo view > /dev/null 2>&1; then
  echo "Creating GitHub repository..."
  gh repo create dust --private --confirm
fi

# Set up branch protection rules
echo "Setting up branch protection rules..."
gh api repos/:owner/:repo/branches/main/protection -X PUT -f required_status_checks[0][context]="build" -f required_status_checks[0][app_id]=null -f required_status_checks[1][context]="security-scan" -f required_status_checks[1][app_id]=null -f required_pull_request_reviews[0][dismissal_restrictions][0][users][0]=null -f required_pull_request_reviews[0][dismissal_restrictions][0][teams][0]=null -f required_pull_request_reviews[0][dismiss_stale_reviews]=true -f required_pull_request_reviews[0][require_code_owner_reviews]=true -f required_pull_request_reviews[0][required_approving_review_count]=1 -f enforce_admins=true -f restrictions=null

gh api repos/:owner/:repo/branches/develop/protection -X PUT -f required_status_checks[0][context]="build" -f required_status_checks[0][app_id]=null -f required_status_checks[1][context]="security-scan" -f required_status_checks[1][app_id]=null -f required_pull_request_reviews[0][dismissal_restrictions][0][users][0]=null -f required_pull_request_reviews[0][dismissal_restrictions][0][teams][0]=null -f required_pull_request_reviews[0][dismiss_stale_reviews]=true -f required_pull_request_reviews[0][require_code_owner_reviews]=true -f required_pull_request_reviews[0][required_approving_review_count]=1 -f enforce_admins=false -f restrictions=null

# Create develop branch if it doesn't exist
if ! git show-ref --verify --quiet refs/heads/develop; then
  echo "Creating develop branch..."
  git checkout -b develop
  git push -u origin develop
  git checkout main
fi

# Set up GitHub Actions secrets
echo "Setting up GitHub Actions secrets..."
gh secret set AWS_ACCESS_KEY_ID --body "$AWS_ACCESS_KEY_ID"
gh secret set AWS_SECRET_ACCESS_KEY --body "$AWS_SECRET_ACCESS_KEY"
gh secret set SNYK_TOKEN --body "$SNYK_TOKEN"
gh secret set SLACK_WEBHOOK_URL --body "$SLACK_WEBHOOK_URL"

# Set up AWS ECR repositories
echo "Setting up AWS ECR repositories..."
for repo in dust-core-api dust-frontend dust-mcp-server; do
  if ! aws ecr describe-repositories --repository-names $repo > /dev/null 2>&1; then
    echo "Creating ECR repository $repo..."
    aws ecr create-repository --repository-name $repo --image-scanning-configuration scanOnPush=true
  fi
done

# Set up AWS CDK
echo "Setting up AWS CDK..."
cd cdk
npm install
npm run build
npm run cdk bootstrap

# Deploy development environment
echo "Deploying development environment..."
npm run deploy:dev

# Set up integration tests
echo "Setting up integration tests..."
cd ../tests/integration
npm init -y
npm install --save-dev jest supertest axios

# Create sample integration test
cat > api.test.js << 'EOF'
const axios = require('axios');

const API_URL = process.env.API_URL || 'https://api.dev.dust.example.com';

describe('Core API', () => {
  test('Health endpoint returns 200', async () => {
    const response = await axios.get(`${API_URL}/health`);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('status', 'ok');
  });
});
EOF

# Set up acceptance tests
echo "Setting up acceptance tests..."
cd ../acceptance
npm init -y
npm install --save-dev cypress

# Create sample acceptance test
mkdir -p cypress/integration
cat > cypress/integration/smoke.spec.js << 'EOF'
describe('Smoke Test', () => {
  it('Should load the homepage', () => {
    cy.visit('/');
    cy.contains('Dust');
  });

  it('Should navigate to login page', () => {
    cy.visit('/');
    cy.contains('Login').click();
    cy.url().should('include', '/login');
  });
});
EOF

# Create cypress configuration
cat > cypress.json << 'EOF'
{
  "baseUrl": "https://staging.dust.example.com",
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "video": false,
  "screenshotOnRunFailure": true,
  "screenshotsFolder": "results/screenshots",
  "trashAssetsBeforeRuns": true,
  "env": {
    "API_URL": "https://api.staging.dust.example.com",
    "MCP_URL": "https://mcp.staging.dust.example.com"
  }
}
EOF

# Return to root directory
cd ../../

# Create pull request template
mkdir -p .github/PULL_REQUEST_TEMPLATE
cat > .github/PULL_REQUEST_TEMPLATE/default.md << 'EOF'
## Description
<!-- Describe the changes in this PR -->

## Related Issues
<!-- Link to any related issues -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Other (please describe)

## Checklist
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] I have added necessary documentation
- [ ] I have updated the CHANGELOG.md file
- [ ] I have tested my changes in all supported browsers
- [ ] I have tested my changes in all supported environments

## Screenshots (if applicable)
<!-- Add screenshots here -->

## Additional Notes
<!-- Add any other notes about the PR here -->
EOF

# Create CODEOWNERS file
cat > .github/CODEOWNERS << 'EOF'
# Default owners for everything in the repo
* @jamon8888

# Owners for specific directories
/services/core-api/ @jamon8888
/services/frontend/ @jamon8888
/services/mcp-server/ @jamon8888
/cdk/ @jamon8888
/.github/ @jamon8888
EOF

# Commit changes
echo "Committing changes..."
git add .
git commit -m "Implement CI/CD pipeline"
git push

echo "CI/CD pipeline implementation completed!"
chmod +x scripts/implement-cicd.sh

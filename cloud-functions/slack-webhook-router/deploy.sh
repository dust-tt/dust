#!/bin/bash

set -e

# Check required environment variables.
if [[ -z "$GCP_US_PROJECT_ID" || -z "$GCP_EU_PROJECT_ID" || -z "$GCP_GLOBAL_PROJECT_ID" ]]; then
  echo "❌ Error: Missing required environment variables"
  echo "   Please set: GCP_US_PROJECT_ID, GCP_EU_PROJECT_ID, and GCP_GLOBAL_PROJECT_ID"
  exit 1
fi

echo "🔧 Project Configuration:"
echo "  Global Project: $GCP_GLOBAL_PROJECT_ID (webhook secrets)"
echo "  US Project: $GCP_US_PROJECT_ID (connector secrets)"
echo "  EU Project: $GCP_EU_PROJECT_ID (connector secrets)"

echo "🏗️ Building TypeScript..."
npm run build

echo "🔧 Setting up service account..."

SA_EMAIL="slack-webhook-router-sa@${GCP_GLOBAL_PROJECT_ID}.iam.gserviceaccount.com"

echo "🚀 Deploying slack-webhook-router to us-central1 region..."

# Deploy to US region only.
gcloud run deploy slack-webhook-router \
  --set-env-vars "GCP_GLOBAL_PROJECT_ID=${GCP_GLOBAL_PROJECT_ID},GCP_US_PROJECT_ID=${GCP_US_PROJECT_ID},GCP_EU_PROJECT_ID=${GCP_EU_PROJECT_ID}" \
  --service-account="$SA_EMAIL" \
  --source . \
  --region us-central1 \
  --project "$GCP_GLOBAL_PROJECT_ID" \
  --allow-unauthenticated \
  --min 1 \
  --startup-probe httpGet.path=/ready,initialDelaySeconds=0,failureThreshold=3,timeoutSeconds=4,periodSeconds=10 \
  --liveness-probe httpGet.path=/health,initialDelaySeconds=30,failureThreshold=3,timeoutSeconds=4,periodSeconds=30

echo "✅ Deployment complete!"
echo "🌍 Webhook router available at: https://slack-webhook-router-<hash>-uc.a.run.app"
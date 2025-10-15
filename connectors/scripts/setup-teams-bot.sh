#!/bin/bash

# Teams Bot Setup Script
# Usage: ./setup-teams-bot.sh <bot-name> [resource-group] [webhook-secret]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if bot name is provided
if [ -z "$1" ]; then
    print_error "Bot name is required"
    echo "Usage: $0 <bot-name> [resource-group] [webhook-secret]"
    echo "Example: $0 my-teams-bot my-resource-group my-webhook-secret"
    exit 1
fi

BOT_NAME="$1"
RESOURCE_GROUP="${2:-dust-bot-rg}"
WEBHOOK_SECRET="${3:-mywebhooksecret}"

print_status "Setting up Teams bot: $BOT_NAME"
print_status "Resource group: $RESOURCE_GROUP"
print_status "Webhook secret: $WEBHOOK_SECRET"

# Get current tenant ID
print_step "1. Getting current tenant information..."
TENANT_ID=$(az account show --query "tenantId" --output tsv)
SUBSCRIPTION_ID=$(az account show --query "id" --output tsv)
print_status "Tenant ID: $TENANT_ID"
print_status "Subscription ID: $SUBSCRIPTION_ID"

# Create resource group if it doesn't exist
print_step "2. Ensuring resource group exists..."
if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
    print_status "Creating resource group: $RESOURCE_GROUP"
    az group create --name "$RESOURCE_GROUP" --location "eastus"
else
    print_status "Resource group already exists: $RESOURCE_GROUP"
fi

# Create Azure AD App Registration
print_step "3. Creating Azure AD App Registration..."
APP_RESULT=$(az ad app create \
    --display-name "$BOT_NAME" \
    --sign-in-audience "AzureADandPersonalMicrosoftAccount" \
    --required-resource-accesses '[
        {
            "resourceAppId": "00000003-0000-0000-c000-000000000000",
            "resourceAccess": [
                    {"id": "ebf0f66e-9fb1-49e4-a278-222f76911cf4", "type": "Scope"},
                    {"id": "7e9a077b-3711-42b9-b7cb-5fa5f3f7fea7", "type": "Scope"},
                    {"id": "7ab1d382-f21e-4acd-a863-ba3e13f7da61", "type": "Role"},
                    {"id": "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0", "type": "Scope"},
                    {"id": "37f7f235-527c-4136-accd-4a02d197296e", "type": "Scope"},
                    {"id": "14dad69e-099b-42c9-810b-d002981feec1", "type": "Scope"},
                    {"id": "9e19bae1-2623-4c4f-ab6e-2664615ff9a0", "type": "Role"},
                    {"id": "5dad17ba-f6cc-4954-a5a2-a0dcc95154f0", "type": "Role"},
                    {"id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d", "type": "Scope"},
                    {"id": "df021288-bdef-4463-88db-98f22de89214", "type": "Role"},
	            ]
        }
    ]')

APP_ID=$(echo "$APP_RESULT" | jq -r '.appId')
APP_OBJECT_ID=$(echo "$APP_RESULT" | jq -r '.id')
print_status "App ID: $APP_ID"
print_status "App Object ID: $APP_OBJECT_ID"

# Create app password/secret
print_step "4. Creating app password..."
sleep 5
PASSWORD_RESULT=$(az ad app credential reset --id "$APP_ID" --display-name "bot-secret")
APP_PASSWORD=$(echo "$PASSWORD_RESULT" | jq -r '.password')
print_status "App password created (will be shown in .env file)"

# Get ngrok endpoint
print_step "5. Getting ngrok endpoint..."
echo ""
print_warning "Please provide your ngrok endpoint (e.g., https://abc123.ngrok-free.app):"
echo -n "Enter ngrok URL: "
read -r NGROK_URL

# Validate ngrok URL
if [[ ! "$NGROK_URL" =~ ^https://.*\.ngrok.*\.app$ ]]; then
    print_warning "Warning: URL doesn't look like a standard ngrok URL"
    echo -n "Continue anyway? (y/N): "
    read -r CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        print_error "Setup cancelled"
        exit 1
    fi
fi

# Remove trailing slash if present
NGROK_URL=${NGROK_URL%/}

# Create Bot Service
print_step "6. Creating Bot Service..."
ENDPOINT="$NGROK_URL/webhooks/$WEBHOOK_SECRET/teams_messages"
print_status "Bot endpoint set to: $ENDPOINT"

az bot create \
    --app-type "SingleTenant" \
    --appid "$APP_ID" \
    --name "$BOT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --endpoint "$ENDPOINT" \
    --tenant-id "$TENANT_ID"

print_status "Bot Service created: $BOT_NAME"

# Enable Teams channel
print_step "7. Enabling Microsoft Teams channel..."
az bot msteams create \
    --name "$BOT_NAME" \
    --resource-group "$RESOURCE_GROUP"

print_status "Teams channel enabled"

# Grant admin consent
print_step "8. Attempting to grant admin consent..."
if az ad app permission admin-consent --id "$APP_ID" 2>/dev/null; then
    print_status "Admin consent granted successfully"
else
    print_warning "Admin consent failed - you may need to grant it manually in the Azure Portal"
    print_warning "Go to: Azure Portal > App registrations > $BOT_NAME > API permissions > Grant admin consent"
fi

# Create/update .env file
print_step "9. Creating .env configuration..."
ENV_FILE=".env"

# Backup existing .env if it exists
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    print_status "Backed up existing .env file"
fi

# Create new .env file
cat > "$ENV_FILE" << EOF
export MICROSOFT_BOT_NAME=$BOT_NAME
export MICROSOFT_BOT_ID=$APP_ID
export MICROSOFT_BOT_PASSWORD=$APP_PASSWORD
export MICROSOFT_BOT_TENANT_ID=$TENANT_ID
export DUST_CONNECTORS_WEBHOOKS_SECRET=$WEBHOOK_SECRET
EOF

print_status ".env file created with bot configuration"

print_step "10. Creating Teams app package..."
source .env
npm run teams:create-app

# Display setup completion
print_step "11. Setup Complete!"
echo ""
print_status "✅ Azure AD App Registration created"
print_status "✅ Bot Service created and configured"
print_status "✅ Teams channel enabled"
print_status "✅ Environment variables configured"
echo ""
print_warning "📋 Next Steps:"
echo "   1. Add content of .env file to your global env file"
echo "   2. Restart connectors service with new env"
echo "   3. Deploy the Teams app package teams-app-package/teams-app.zip to Teams: https://dev.teams.microsoft.com/apps"
echo ""
print_warning "💡 Important Notes:"
echo "   - Bot endpoint is set to: $ENDPOINT"
echo "   - Make sure your ngrok tunnel is running and matches this URL"
echo "   - If you restart ngrok with a new URL, update the bot endpoint in Azure Portal"
echo ""
print_status "🔗 Useful Links:"
echo "   - Azure Portal: https://portal.azure.com"
echo "   - Bot Service: https://portal.azure.com/#@$TENANT_ID/resource/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.BotService/botServices/$BOT_NAME"
echo "   - App Registration: https://portal.azure.com/#@$TENANT_ID/blade/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/Overview/appId/$APP_ID"
echo ""
print_status "Bot setup completed successfully! 🎉"

# Unified Webhook Router

A secure Firebase Function that routes webhooks from Slack and Microsoft Teams to multiple regional endpoints with platform-specific verification.

## Features

- ✅ **Multi-platform support** - Handles Slack and Microsoft Teams webhooks
- ✅ **Platform-specific verification** - Slack HMAC signatures + Teams JWT validation
- ✅ **Webhook secret validation** - Double security layer for both platforms
- ✅ **Multi-region forwarding** - Routes to US and EU endpoints
- ✅ **URL verification** - Handles Slack's URL verification challenges
- ✅ **Form-data preservation** - Maintains original webhook formats
- ✅ **Serverless scaling** - Auto-scales from 0 to N instances
- ✅ **TLS 1.2+ support** - Built-in secure connections
- ✅ **Custom domain** mapping with automatic SSL certificates

## Setup

### Prerequisites

1. **Install Firebase CLI** (if not already installed):

   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:

   ```bash
   firebase login
   ```

3. **Environment Variables**:
   Set the required GCP project IDs for deployment:
   - `GCP_GLOBAL_PROJECT_ID`
   - `GCP_US_PROJECT_ID`
   - `GCP_EU_PROJECT_ID`

### Project Configuration

The project is configured to deploy to `dust-infra` (see `.firebaserc`).

## Deployment

### Deploy to Production

```bash
npm run deploy   # Builds and deploys to Firebase Functions + Hosting
```

The deploy script will:

1. Validate required environment variables
2. Create `.env` file for Firebase deployment
3. Build TypeScript
4. Deploy both function and hosting configuration

### Test Locally with Firebase Emulator

```bash
npm run dev      # Start Firebase emulator
```

## Function URLs

### Local Development (Emulator)

```
http://localhost:5001/dust-infra/us-central1/webhookRouter/YOUR_WEBHOOK_SECRET/slack/events
http://localhost:5001/dust-infra/us-central1/webhookRouter/YOUR_WEBHOOK_SECRET/slack/interactions
http://localhost:5001/dust-infra/us-central1/webhookRouter/YOUR_WEBHOOK_SECRET/microsoft/teams/messages
http://localhost:5001/dust-infra/us-central1/webhookRouter/YOUR_WEBHOOK_SECRET/notion
```

### Production

**Direct Function URL:**

```
https://us-central1-dust-infra.cloudfunctions.net/webhookRouter/YOUR_WEBHOOK_SECRET/slack/events
https://us-central1-dust-infra.cloudfunctions.net/webhookRouter/YOUR_WEBHOOK_SECRET/slack/interactions
https://us-central1-dust-infra.cloudfunctions.net/webhookRouter/YOUR_WEBHOOK_SECRET/microsoft/teams/messages
https://us-central1-dust-infra.cloudfunctions.net/webhookRouter/YOUR_WEBHOOK_SECRET/notion
```

**Custom Domain (via Firebase Hosting):**

```
https://webhook.dust.tt/YOUR_WEBHOOK_SECRET/slack/events
https://webhook.dust.tt/YOUR_WEBHOOK_SECRET/slack/interactions
https://webhook.dust.tt/YOUR_WEBHOOK_SECRET/microsoft/teams/messages
https://webhook.dust.tt/YOUR_WEBHOOK_SECRET/notion
```

## Architecture

```
Slack/Teams → Firebase Hosting → Firebase Function → [US Endpoint, EU Endpoint]
```

**Security Flow:**

1. Validates webhook secret from URL parameter
2. Platform-specific verification:
   - **Slack**: HMAC signature validation
   - **Teams**: Bot Framework JWT token validation
3. Handles platform-specific challenges (Slack URL verification)
4. Forwards to regional endpoints asynchronously

**Body Handling:**

- **Events** (JSON): Parsed for route handlers, forwarded as JSON
- **Interactions** (form-encoded): Preserved as original format with `payload` field

## Secret Management

Uses GCP Secret Manager for production:

- `connectors-DUST_CONNECTORS_WEBHOOKS_SECRET` - Webhook secret
- `SLACK_SIGNING_SECRET` - Slack app signing secret
- `MICROSOFT_BOT_ID_SECRET` - Microsoft Bot Framework App ID

For local development, set environment variables:

```bash
export DUST_CONNECTORS_WEBHOOKS_SECRET="your-webhook-secret"
export SLACK_SIGNING_SECRET="your-slack-signing-secret"
export MICROSOFT_BOT_ID_SECRET="your-bot-app-id"
export NOTION_SIGNING_SECRET="your-notion-signing-secret"
```

## Benefits over Cloud Run

✅ **TLS 1.2+** support out of the box
✅ **Custom domain** mapping with automatic SSL certificates
✅ **No cold starts** for HTTP functions
✅ **Simpler deployment** - no container management
✅ **Built-in monitoring** and logging

## API Endpoints

### Slack Endpoints

- `POST /:webhookSecret/slack/events` - Slack events
- `POST /:webhookSecret/slack/interactions` - Slack interactions

### Microsoft Teams Endpoints

- `POST /:webhookSecret/microsoft/teams/messages` - Teams messages

### Notion Endpoint

- `POST /:webhookSecret/notion` - Teams messages

## Development

```bash
npm install     # Install dependencies
npm run build   # Build TypeScript
npm run lint    # Run linter
npm run dev     # Start Firebase emulator
```

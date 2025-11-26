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
- ✅ **GCS config synchronization** - Automatically syncs webhook configuration from GCS to Firebase Realtime Database

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
   - `GCP_WEBHOOK_ROUTER_CONFIG_BUCKET`

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

The emulator runs the following services:
- **Functions** (port 5001) - Webhook router and config sync functions
- **Hosting** (port 5000) - Custom domain routing
- **Realtime Database** (port 9000) - Webhook configuration cache
- **Storage** (port 9199) - GCS emulation for config file

**Local Environment Setup:**

Create a `.env.local` file in the root folder with:

```bash
GCP_WEBHOOK_ROUTER_CONFIG_BUCKET=dust-infra.firebasestorage.app
SLACK_SIGNING_SECRET="your-slack-signing-secret"
MICROSOFT_BOT_ID_SECRET="your-bot-app-id"
NOTION_SIGNING_SECRET="your-notion-signing-secret"
US_CONNECTOR_URL=http://localhost:3002
EU_CONNECTOR_URL=http://localhost:3002
```

Note: `GCP_WEBHOOK_ROUTER_CONFIG_BUCKET` must be set to `dust-infra.firebasestorage.app` for the config sync function to work properly with the emulator.

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
https://webhook-router.dust.tt/YOUR_WEBHOOK_SECRET/slack/events
https://webhook-router.dust.tt/YOUR_WEBHOOK_SECRET/slack/interactions
https://webhook-router.dust.tt/YOUR_WEBHOOK_SECRET/microsoft/teams/messages
https://webhook-router.dust.tt/YOUR_WEBHOOK_SECRET/notion
```

## Architecture

```
Slack/Teams → Firebase Hosting → Firebase Function → [US Endpoint, EU Endpoint]
                                           ↓
                              Firebase Realtime Database
                                           ↑
                              GCS (webhook-router-config.json)
```

**Security Flow:**

1. Validates webhook secret from URL parameter (standard routes) or fetches from config (data sync routes)
2. Platform-specific verification:
   - **Slack**: HMAC signature validation using Dust secret (standard) or client secret (data sync)
   - **Teams**: Bot Framework JWT token validation
3. Handles platform-specific challenges (Slack URL verification)
4. Forwards to regional endpoints based on configuration

**Body Handling:**

- **Events** (JSON): Parsed for route handlers, forwarded as JSON
- **Interactions** (form-encoded): Preserved as original format with `payload` field

**Configuration Synchronization:**

- The `syncWebhookRouterConfig` function automatically syncs `webhook-router-config.json` from GCS to Firebase Realtime Database
- Triggered by GCS object finalization events
- Ensures webhook configuration is cached in the database for fast access
- Firebase Storage and Realtime Database rules restrict all read/write access for security

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

## Firebase Services Used

- **Cloud Functions** - Serverless webhook routing (`webhookRouter`) and config synchronization (`syncWebhookRouterConfig`)
- **Hosting** - Custom domain with automatic SSL and request routing
- **Realtime Database** - Webhook configuration cache (read-only, synced from GCS)
- **Cloud Storage** - Source of truth for webhook configuration (`webhook-router-config.json`)

## Benefits over Cloud Run

- ✅ **TLS 1.2+** support out of the box
- ✅ **Custom domain** mapping with automatic SSL certificates
- ✅ **No cold starts** for HTTP functions
- ✅ **Simpler deployment** - no container management
- ✅ **Built-in monitoring** and logging
- ✅ **Integrated services** - Seamless integration with Realtime Database and Cloud Storage

## API Endpoints

### Slack Endpoints

**Standard Routes** (use Dust signing secret):
- `POST /:webhookSecret/slack/events` - Slack events
- `POST /:webhookSecret/slack/interactions` - Slack interactions

**Data Sync Routes** (use client-specific signing secrets from config):
- `POST /slack_data_sync/events` - Slack events with per-team validation
- `POST /slack_data_sync/interactions` - Slack interactions with per-team validation

### Microsoft Teams Endpoints

- `POST /:webhookSecret/microsoft/teams/messages` - Teams messages

### Notion Endpoint

- `POST /:webhookSecret/notion` - Notion events

## Development

```bash
npm install     # Install dependencies
npm run build   # Build TypeScript
npm run lint    # Run linter
npm run dev     # Start Firebase emulator
```

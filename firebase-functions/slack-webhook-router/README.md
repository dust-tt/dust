# Slack Webhook Router

A secure Firebase Function that routes Slack webhooks to multiple regional endpoints with signature verification.

## Features

- ✅ **Slack signature verification** - Validates all incoming requests from Slack
- ✅ **Webhook secret validation** - Double security layer
- ✅ **Multi-region forwarding** - Routes to US and EU endpoints
- ✅ **URL verification** - Handles Slack's URL verification challenges
- ✅ **Form-data preservation** - Maintains original Slack interaction format
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
http://localhost:5001/dust-infra/us-central1/slackWebhookRouter/YOUR_WEBHOOK_SECRET/events
http://localhost:5001/dust-infra/us-central1/slackWebhookRouter/YOUR_WEBHOOK_SECRET/interactions
```

### Production

**Direct Function URL:**

```
https://us-central1-dust-infra.cloudfunctions.net/slackWebhookRouter/YOUR_WEBHOOK_SECRET/events
https://us-central1-dust-infra.cloudfunctions.net/slackWebhookRouter/YOUR_WEBHOOK_SECRET/interactions
```

**Custom Domain (via Firebase Hosting):**

```
https://slack-webhook.dust.tt/YOUR_WEBHOOK_SECRET/events
https://slack-webhook.dust.tt/YOUR_WEBHOOK_SECRET/interactions
```

## Architecture

```
Slack → Firebase Hosting → Firebase Function → [US Endpoint, EU Endpoint]
```

**Security Flow:**

1. Validates webhook secret from URL parameter
2. Verifies Slack request signature
3. Handles URL verification challenges
4. Forwards to regional endpoints asynchronously

**Body Handling:**

- **Events** (JSON): Parsed for route handlers, forwarded as JSON
- **Interactions** (form-encoded): Preserved as original format with `payload` field

## Secret Management

Uses GCP Secret Manager for production:

- `connectors-DUST_CONNECTORS_WEBHOOKS_SECRET` - Webhook secret
- `SLACK_SIGNING_SECRET` - Slack app signing secret

For local development, set environment variables:

```bash
export DUST_CONNECTORS_WEBHOOKS_SECRET="your-webhook-secret"
export SLACK_SIGNING_SECRET="your-slack-signing-secret"
```

## Benefits over Cloud Run

✅ **TLS 1.2+** support out of the box
✅ **Custom domain** mapping with automatic SSL certificates
✅ **No cold starts** for HTTP functions
✅ **Simpler deployment** - no container management
✅ **Built-in monitoring** and logging

## API Endpoints

- `POST /:webhookSecret/events` - Slack events
- `POST /:webhookSecret/interactions` - Slack interactions

## Development

```bash
npm install     # Install dependencies
npm run build   # Build TypeScript
npm run lint    # Run linter
npm run dev     # Start Firebase emulator
```

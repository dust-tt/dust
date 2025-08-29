# Dust Teams Bot Setup

This Teams app integrates with your Dust AI assistant backend to provide conversational AI capabilities within Microsoft Teams.

## How it Works

1. **Message Detection**: The bot listens for messages starting with `@dust`
2. **Thinking Message**: The bot immediately shows "🤔 Dust AI is thinking..." via Bot Framework
3. **Webhook Call**: The bot calls your Dust connector webhook asynchronously with message details
4. **AI Processing**: The Dust backend processes the message using your configured AI agents
5. **Response Callback**: Dust sends the AI response back to the Teams app via Bot Framework
6. **Final Response**: The Teams app delivers the AI response to the user

## Configuration

1. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

2. **Configure environment variables** in `.env`:
   ```bash
   # Webhook URL for Dust connector
   WEBHOOK_URL=https://your-dust-domain.com/webhooks/your_secret/teams_bot
   
   # Bot Framework credentials (from Teams app registration)
   BOT_ID=your-bot-app-id
   BOT_PASSWORD=your-bot-app-password
   
   # Port for the Teams app
   PORT=3978
   ```
   
   Replace:
   - `your-dust-domain.com` with your Dust connector service domain
   - `your_secret` with your webhook secret configured in Dust
   - Bot credentials from your Microsoft Teams app registration

3. **Install dependencies**:
   ```bash
   npm install
   ```

## Usage

Once configured and deployed to Teams:

1. Add the bot to a Teams chat or channel
2. Send messages starting with `@dust` followed by your question:
   ```
   @dust What is the weather today?
   @dust Summarize the latest project updates
   @dust Help me write a proposal for the new feature
   ```

3. The AI assistant will respond with contextual information based on your Dust configuration

## Development

Run in development mode:
```bash
npm run dev
```

## Teams App Manifest

Make sure your Teams app manifest (`appPackage/manifest.json`) includes:

- **Bot capabilities** with appropriate scopes
- **Messaging extension** if needed
- **Permissions** for reading messages and posting responses

## Integration with Dust Backend

### Architecture Overview

**Teams App (Port 3978)**:
- `/api/messages` - Bot Framework endpoint for Teams messages  
- `/api/webhook-response` - Receives AI responses from Dust connector

**Dust Connectors Service (Port 3002)**:
- `/webhooks/{secret}/teams_bot` - Processes Teams messages and generates AI responses
- Calls back to Teams app with response via Bot Framework

### Required Configuration

**In Dust Connectors** (`.env`):
```bash
TEAMS_APP_URL=http://localhost:3978  # Or your Teams app URL
```

**In Teams App** (`.env`):
```bash
WEBHOOK_URL=http://localhost:3002/webhooks/your_secret/teams_bot
BOT_ID=your-bot-app-id
BOT_PASSWORD=your-bot-app-password
```

### Key Benefits of Bot Framework Approach

1. **No Graph API permissions needed** - Uses Bot Framework messaging
2. **Proper conversation context** - Maintains Teams conversation threading  
3. **Real-time responses** - Immediate "thinking" message with async AI response
4. **Error handling** - Graceful fallback for webhook failures
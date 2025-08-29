# Dust Teams Bot Setup

This Teams app integrates with your Dust AI assistant backend to provide conversational AI capabilities within Microsoft Teams.

## How it Works

1. **Message Detection**: The bot listens for messages starting with `@dust`
2. **Webhook Integration**: When a `@dust` message is detected, it forwards the message to your Dust connector webhook
3. **AI Processing**: The Dust backend processes the message using your configured AI agents
4. **Response**: The AI assistant responds directly in the Teams conversation

## Configuration

1. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

2. **Configure the webhook URL** in `.env`:
   ```
   WEBHOOK_URL=https://your-dust-domain.com/webhooks/your_secret/teams_bot
   ```
   
   Replace:
   - `your-dust-domain.com` with your Dust connector service domain
   - `your_secret` with your webhook secret configured in Dust

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

This Teams app works with the Teams webhook handler implemented in the Dust connectors service:

- **Endpoint**: `/webhooks/{secret}/teams_bot`
- **Handler**: `webhook_teams_bot.ts`
- **Message Processing**: `teams/bot.ts`
- **Response Streaming**: `teams/stream_conversation_handler.ts`

The webhook expects the specific payload format implemented in `genericCommandHandler.ts`.
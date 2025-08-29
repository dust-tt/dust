import { BotFrameworkAdapter, TurnContext } from "botbuilder";
import express from "express";
import { GenericCommandHandler } from "./genericCommandHandler";
import { adapter } from "./internal/initialize";
import { ApplicationTurnState } from "./internal/interface";
import { app } from "./teamsBot";

// This template uses `express` to serve HTTP responses.
// Create express application.
const expressApp = express();
expressApp.use(express.json());

const server = expressApp.listen(
  process.env.port || process.env.PORT || 3978,
  () => {
    console.log(
      `\nBot Started, ${expressApp.name} listening to`,
      server.address()
    );
  }
);

const genericCommandHandler = new GenericCommandHandler();
app.message(
  genericCommandHandler.triggerPatterns,
  async (context: TurnContext, state: ApplicationTurnState) => {
    const reply = await genericCommandHandler.handleCommandReceived(
      context,
      state
    );

    if (reply) {
      await context.sendActivity(reply);
    }
  }
);

// Register an API endpoint with `express`. Teams sends messages to your application
// through this endpoint.
//
// The Microsoft 365 Agents Toolkit bot registration configures the bot with `/api/messages` as the
// Bot Framework endpoint. If you customize this route, update the Bot registration
// in `infra/botRegistration/azurebot.bicep`.
expressApp.post("/api/messages", async (req, res) => {
  await adapter.process(req, res, async (context) => {
    await app.run(context);
  });
});

// Endpoint for webhook to send AI responses back via Bot Framework
expressApp.post("/api/webhook-response", async (req, res) => {
  try {
    const { serviceUrl, conversationId, response, error } = req.body;
    
    if (!serviceUrl || !conversationId) {
      return res.status(400).json({ error: "Missing serviceUrl or conversationId" });
    }

    // Create a new adapter instance for the callback
    const callbackAdapter = new BotFrameworkAdapter({
      appId: process.env.BOT_ID,
      appPassword: process.env.BOT_PASSWORD
    });

    // Create conversation reference
    const conversationReference = {
      activityId: req.body.activityId,
      user: { id: req.body.userId || "unknown", name: req.body.userName || "User" },
      bot: { id: process.env.BOT_ID || "bot", name: "Dust AI" },
      conversation: { id: conversationId, name: "", conversationType: "", tenantId: "", isGroup: false },
      channelId: "msteams",
      serviceUrl: serviceUrl
    };

    // Send response via Bot Framework
    await callbackAdapter.continueConversation(conversationReference, async (context) => {
      if (error) {
        await context.sendActivity(`❌ ${error}`);
      } else if (response) {
        await context.sendActivity(response);
      }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending webhook response:", err);
    res.status(500).json({ error: err.message });
  }
});

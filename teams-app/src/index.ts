import { BotFrameworkAdapter, TurnContext } from "botbuilder";
import express from "express";
import { GenericCommandHandler } from "./genericCommandHandler";
import { adapter } from "./internal/initialize";
import { ApplicationTurnState } from "./internal/interface";
import { app } from "./teamsBot";
import axios from "axios";
import { createThinkingAdaptiveCard } from "./utils";

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

// Middleware to log all incoming requests
expressApp.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[REQUEST] Body:`, req.body);
  }
  next(); // Continue to the next middleware/route handler
});

const genericCommandHandler = new GenericCommandHandler();

// Message extension for searching and selecting Dust agents
app.messageExtensions.query("searchAgents", async (context, state, query) => {
  try {
    // Get the list of agents from your Dust API
    const webhookUrl =
      process.env.WEBHOOK_URL ||
      "http://localhost:3002/webhooks/mywebhooksecret/teams_bot";
    const agentsUrl = webhookUrl.replace("/teams_bot", "/teams_agents");

    const response = await axios.get(agentsUrl, { timeout: 5000 });
    const agents = response.data.agents || [];

    // Filter agents based on user's search query
    const searchTerm = query.parameters?.searchQuery?.toLowerCase() || "";
    const filteredAgents = agents.filter(
      (agent: any) =>
        agent.name.toLowerCase().includes(searchTerm) ||
        agent.description?.toLowerCase().includes(searchTerm)
    );

    // Return multiple results as simple text attachments
    const results = filteredAgents.slice(0, 10).map((agent: any) => ({
      contentType: "application/vnd.microsoft.card.hero",
      content: {
        title: agent.name,
        subtitle: agent.description || `Ask ${agent.name} a question`,
        tap: {
          type: "imBack",
          value: `@${agent.name} `,
        },
      },
    }));

    return {
      type: "result",
      attachments: results,
    };
  } catch (error) {
    console.error("Error fetching agents for message extension:", error);

    // Fallback to default text
    return {
      type: "result",
      attachments: [],
    };
  }
});

app.adaptiveCards.actionSubmit(
  "ask_agent",
  async (context, _state, data: any) => {
    console.log("Received adaptive card submit:", data);

    const { agentId, agentName, originalMessage } = data;

    const thinkingCard = createThinkingAdaptiveCard();
    await context.sendActivity(thinkingCard);

    // Clean the original message by removing any existing agent mentions
    const cleanMessage = originalMessage
      .replace(/^[@+~][a-zA-Z0-9_-]+\s*/, "")
      .trim();

    const webhookUrl =
      process.env.WEBHOOK_URL ||
      "http://localhost:3002/webhooks/mywebhooksecret/teams_bot";

    // Create webhook payload for the new agent request
    const webhookPayload = {
      type: "message",
      tenantId: context.activity.conversation?.tenantId || "unknown-tenant",
      activity: {
        type: "message",
        id: context.activity.id,
        timestamp: context.activity.timestamp,
        channelId: context.activity.channelId,
        from: {
          id: context.activity.from.id,
          name: context.activity.from.name,
          aadObjectId: context.activity.from.aadObjectId,
        },
        conversation: {
          id: context.activity.conversation.id,
          name: context.activity.conversation.name,
          conversationType: context.activity.conversation.conversationType,
          tenantId: context.activity.conversation.tenantId,
        },
        recipient: {
          id: context.activity.recipient?.id,
          name: context.activity.recipient?.name,
        },
        text: `@${agentName} ${cleanMessage}`,
        textFormat: context.activity.textFormat,
        locale: context.activity.locale,
        replyToId: context.activity.replyToId,
      },
      responseCallback: {
        serviceUrl: context.activity.serviceUrl,
        conversationId: context.activity.conversation.id,
        activityId: context.activity.id,
      },
    };

    // Call webhook asynchronously
    axios
      .post(webhookUrl, webhookPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      })
      .catch((error) => {
        console.error("Error calling webhook for agent selection:", error);
        context.sendActivity(
          `❌ Sorry, I encountered an error: ${error.message}`
        );
      });

    return; // Don't process as regular message
  }
);

// Handle all messages (both text and adaptive card submissions)
app.message(/.*/, async (context: TurnContext, state: ApplicationTurnState) => {
  // Check if this is an adaptive card submit
  // if (context.activity.value) {

  // Handle regular text messages only if there's actual text
  if (context.activity.text) {
    const reply = await genericCommandHandler.handleCommandReceived(
      context,
      state,
      streamingMessages
    );

    if (reply) {
      await context.sendActivity(reply);
    }
  }
});

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

// Store message references for streaming updates
const streamingMessages = new Map<string, string>(); // conversationId -> activityId

// Export for use in other modules
module.exports = { streamingMessages };

// Endpoint for webhook to send AI responses back via Bot Framework
expressApp.post("/api/webhook-response", async (req, res) => {
  try {
    const {
      serviceUrl,
      conversationId,
      response,
      error,
      adaptiveCard,
      isStreaming,
    } = req.body;

    if (!serviceUrl || !conversationId) {
      return res
        .status(400)
        .json({ error: "Missing serviceUrl or conversationId" });
    }

    // Create a new adapter instance for the callback
    const callbackAdapter = new BotFrameworkAdapter({
      appId: process.env.BOT_ID,
      appPassword: process.env.BOT_PASSWORD,
    });

    // Create conversation reference
    const conversationReference = {
      activityId: req.body.activityId,
      user: {
        id: req.body.userId || "unknown",
        name: req.body.userName || "User",
      },
      bot: { id: process.env.BOT_ID || "bot", name: "Dust AI" },
      conversation: {
        id: conversationId,
        name: "",
        conversationType: "",
        tenantId: "",
        isGroup: false,
      },
      channelId: "msteams",
      serviceUrl: serviceUrl,
    };

    // Handle streaming updates vs final responses
    await callbackAdapter.continueConversation(
      conversationReference,
      async (context) => {
        if (error) {
          await context.sendActivity(`❌ ${error}`);
        } else if (adaptiveCard) {
          const existingActivityId = streamingMessages.get(conversationId);
          if (existingActivityId) {
            // Update existing message for streaming
            try {
              const updateActivity = {
                ...adaptiveCard,
                id: existingActivityId,
              };
              await context.updateActivity(updateActivity);
            } catch (updateError) {
              console.warn(
                "Failed to update streaming message, sending new one:",
                updateError
              );
              const sentActivity = await context.sendActivity(adaptiveCard);
              if (sentActivity?.id) {
                streamingMessages.set(conversationId, sentActivity.id);
              }
            }
          } else {
            // Send new message (final response or first streaming message)
            const sentActivity = await context.sendActivity(adaptiveCard);
            if (sentActivity?.id && isStreaming) {
              streamingMessages.set(conversationId, sentActivity.id);
            }
          }

          if (!isStreaming) {
            // Clean up streaming reference for final message
            streamingMessages.delete(conversationId);
          }
        } else if (response) {
          // Fallback to plain text response
          await context.sendActivity(response);
        }
      }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error sending webhook response:", err);
    res.status(500).json({ error: err.message });
  }
});

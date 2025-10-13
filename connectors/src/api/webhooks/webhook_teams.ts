import { DustAPI } from "@dust-tt/client";
import type { TurnContext } from "botbuilder";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import type { Request, Response } from "express";

import { getConnector } from "@connectors/api/webhooks/teams/utils";
import {
  createErrorAdaptiveCard,
  createThinkingAdaptiveCard,
} from "@connectors/connectors/teams/adaptive_cards";
import { botAnswerTeamsMessage } from "@connectors/connectors/teams/bot";
import { sendActivity } from "@connectors/connectors/teams/bot_messaging_utils";
import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

// Store message references for streaming updates
const streamingMessages = new Map<string, string>(); // conversationId -> activityId

// CloudAdapter configuration - simplified for incoming message validation only
const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MICROSOFT_BOT_ID,
  MicrosoftAppPassword: process.env.MICROSOFT_BOT_PASSWORD,
  MicrosoftAppType: "MultiTenant",
  MicrosoftAppTenantId: process.env.MICROSOFT_BOT_TENANT_ID,
});

const adapter = new CloudAdapter(botFrameworkAuthentication);

// Error handler for the adapter
adapter.onTurnError = async (context, error) => {
  logger.error(
    {
      error: error.message,
      stack: error.stack,
      botId: process.env.MICROSOFT_BOT_ID,
      hasPassword: !!process.env.MICROSOFT_BOT_PASSWORD,
    },
    "Bot Framework adapter error"
  );

  // Try to send error message if context allows
  try {
    await sendActivity(context, {
      type: "message",
      text: "❌ An error occurred processing your request.",
    });
  } catch (e) {
    logger.error("Failed to send error activity", e);
  }
};

/**
 * Direct Teams Bot Framework endpoint in connectors
 * Handles all Teams messages, adaptive cards, and message extensions
 */
export async function webhookTeamsAPIHandler(req: Request, res: Response) {
  logger.info(
    {
      headers: {
        authorization: req.headers.authorization ? "Bearer [TOKEN]" : "MISSING",
        contentType: req.headers["content-type"],
        userAgent: req.headers["user-agent"],
        msTeamsConversationId: req.headers["ms-teams-conversation-id"],
      },
      bodySize: JSON.stringify(req.body).length,
      requestId: req.headers["x-request-id"],
    },
    "Received Teams messages webhook with details"
  );

  try {
    await adapter.process(req, res, async (context) => {
      logger.info(
        {
          activityType: context.activity.type,
          activityName: context.activity.name,
          conversationId: context.activity.conversation?.id,
          text: context.activity.text,
        },
        "Received Teams activity"
      );

      const connector = await getConnector(context);
      if (!connector) {
        return;
      }

      // Handle different activity types
      switch (context.activity.type) {
        case "message":
          await handleMessage(context, connector);
          break;

        case "invoke":
          await handleInvoke(context, connector);
          break;

        default:
          logger.info(
            { activityType: context.activity.type },
            "Unhandled activity type"
          );
          break;
      }
    });
  } catch (error) {
    logger.error({ error }, "Error in Teams messages webhook");
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleMessage(
  context: TurnContext,
  connector: ConnectorResource
) {
  // Check if it's an adaptive card submit
  if (context.activity.value?.action === "ask_agent") {
    await handleAgentSelection(context, connector);
    return;
  }

  // Handle regular text messages
  if (context.activity.text?.trim()) {
    await handleTextMessage(context, connector);
  }
}

async function handleInvoke(
  context: TurnContext,
  connector: ConnectorResource
) {
  // Handle message extensions (compose extensions)
  if (context.activity.name === "composeExtension/query") {
    await handleMessageExtension(context, connector);
  }
}

async function handleAgentSelection(
  context: TurnContext,
  connector: ConnectorResource
) {
  const { agentId, agentName, originalMessage } = context.activity.value;

  logger.info(
    { agentId, agentName, originalMessage },
    "Handling agent selection from adaptive card"
  );

  // Send thinking message
  const thinkingCard = createThinkingAdaptiveCard();
  const thinkingActivity = await sendActivity(context, thinkingCard);

  if (thinkingActivity?.id) {
    streamingMessages.set(
      context.activity.conversation.id,
      thinkingActivity.id
    );
  }

  // Clean the message and add agent mention
  const cleanMessage = originalMessage
    .replace(/^[@+~][a-zA-Z0-9_-]+\s*/, "")
    .trim();
  const agentMessage = `@${agentName} ${cleanMessage}`;

  await processTeamsMessage(context, agentMessage, connector);
}

async function handleTextMessage(
  context: TurnContext,
  connector: ConnectorResource
) {
  logger.info({ text: context.activity.text }, "Handling regular text message");

  // Send thinking message
  let thinkingActivity;
  try {
    const thinkingCard = createThinkingAdaptiveCard();

    logger.info(
      {
        serviceUrl: context.activity.serviceUrl,
        conversationId: context.activity.conversation?.id,
        cardType: "ThinkingCard",
        credentials: {
          hasAppId: !!process.env.MICROSOFT_BOT_ID,
          hasAppPassword: !!process.env.MICROSOFT_BOT_PASSWORD,
        },
      },
      "About to send thinking card to Bot Framework"
    );

    // Use utility function for reliable messaging
    thinkingActivity = await sendActivity(context, thinkingCard);
    logger.info(
      { activityId: thinkingActivity?.id },
      "Successfully sent thinking card"
    );
  } catch (error) {
    logger.error(
      {
        error,
      },
      "Failed to send thinking card - detailed error"
    );
  }

  if (thinkingActivity?.id) {
    streamingMessages.set(
      context.activity.conversation.id,
      thinkingActivity.id
    );
  }

  await processTeamsMessage(context, context.activity.text, connector);
}

async function handleMessageExtension(
  context: TurnContext,
  connector: ConnectorResource
) {
  try {
    const query = context.activity.value;
    logger.info({ query }, "Handling message extension query");

    const dustAPI = new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
      },
      logger
    );

    const agentConfigurationsRes = await dustAPI.getAgentConfigurations({});

    if (agentConfigurationsRes.isErr()) {
      logger.error(
        { error: agentConfigurationsRes.error },
        "Failed to get agent configurations"
      );
      return;
    }

    const agents = agentConfigurationsRes.value
      .filter((ac) => ac.status === "active")
      .map((ac) => ({
        sId: ac.sId,
        name: ac.name,
        description: ac.description,
        usage: ac.usage,
      }))
      // Sort by usage (most popular first)
      .sort(
        (a, b) => (b.usage?.messageCount ?? 0) - (a.usage?.messageCount ?? 0)
      );

    // Filter agents based on search query
    const searchTerm = query.parameters?.searchQuery?.toLowerCase() || "";
    const filteredAgents = agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(searchTerm) ||
        agent.description?.toLowerCase().includes(searchTerm)
    );

    // Return agent results
    const results = filteredAgents.slice(0, 10).map((agent) => ({
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

    const composeResponse = {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments:
          results.length > 0
            ? results
            : [
                {
                  contentType: "application/vnd.microsoft.card.hero",
                  content: {
                    title: "No agents found",
                    subtitle: `No agents match "${searchTerm}"`,
                    tap: {
                      type: "imBack",
                      value: "@dust ",
                    },
                  },
                },
              ],
      },
    };

    await sendActivity(context, { value: composeResponse });
  } catch (error) {
    logger.error({ error }, "Error handling message extension");
    await sendActivity(context, {
      value: { composeExtension: { type: "result", attachments: [] } },
    });
  }
}

async function processTeamsMessage(
  context: TurnContext,
  message: string,
  connector: ConnectorResource
) {
  try {
    const result = await botAnswerTeamsMessage(
      context,
      message,
      connector,
      streamingMessages
    );

    if (result.isErr()) {
      logger.error({ error: result.error }, "Error processing Teams message");
      await sendActivity(
        context,
        createErrorAdaptiveCard({
          error: result.error.message,
          workspaceId: connector!.workspaceId,
        })
      );
    }
  } catch (error) {
    logger.error({ error }, "Error processing Teams message");
    await sendActivity(
      context,
      createErrorAdaptiveCard({
        error: "An unexpected error occurred",
        workspaceId: "unknown",
      })
    );
  }
}

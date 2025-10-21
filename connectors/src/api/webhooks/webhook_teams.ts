import type { TurnContext } from "botbuilder";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import type { Request, Response } from "express";

import {
  createErrorAdaptiveCard,
  createThinkingAdaptiveCard,
} from "@connectors/api/webhooks/teams/adaptive_cards";
import {
  botAnswerMessage,
  sendFeedback,
} from "@connectors/api/webhooks/teams/bot";
import {
  sendActivity,
  sendTextMessage,
} from "@connectors/api/webhooks/teams/bot_messaging_utils";
import {
  extractBearerToken,
  validateBotFrameworkToken,
} from "@connectors/api/webhooks/teams/jwt_validation";
import { getConnector } from "@connectors/api/webhooks/teams/utils";
import logger, { Logger } from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

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
      connectorProvider: "microsoft_bot",
      error: error.message,
      stack: error.stack,
      botId: process.env.MICROSOFT_BOT_ID,
      hasPassword: !!process.env.MICROSOFT_BOT_PASSWORD,
    },
    "Bot Framework adapter error"
  );

  // Try to send error message if context allows
  try {
    await sendTextMessage(
      context,
      "❌ An error occurred processing your request."
    );
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
      connectorProvider: "microsoft_bot",
      headers: {
        authorization: req.headers.authorization ? "Bearer [TOKEN]" : "MISSING",
        contentType: req.headers["content-type"],
        userAgent: req.headers["user-agent"],
        msTeamsConversationId: req.headers["ms-teams-conversation-id"],
      },
      bodySize: JSON.stringify(req.body).length,
      requestId: req.headers["x-request-id"],
      clientIp: req.ip,
    },
    "Received Teams messages webhook with details"
  );

  // Step 1: Validate Bot Framework JWT token
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    logger.warn(
      { connectorProvider: "microsoft_bot" },
      "Missing or invalid Authorization header in Teams webhook"
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid Authorization header",
      },
      status_code: 401,
    });
  }

  const microsoftAppId = process.env.MICROSOFT_BOT_ID;
  if (!microsoftAppId) {
    logger.error(
      { connectorProvider: "microsoft_bot" },
      "MICROSOFT_BOT_ID environment variable not set"
    );
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "Bot configuration error",
      },
      status_code: 500,
    });
  }

  // Validate JWT token
  const claims = await validateBotFrameworkToken(token, microsoftAppId);
  if (!claims) {
    logger.warn(
      { microsoftAppId, connectorProvider: "microsoft_bot" },
      "Invalid Bot Framework JWT token"
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Invalid authentication token",
      },
      status_code: 403,
    });
  }

  // Step 2: Validate request origin
  const expectedOrigins = [
    "https://smba.trafficmanager.net",
    "https://eus.smba.trafficmanager.net",
    "https://wus.smba.trafficmanager.net",
    "https://emea.smba.trafficmanager.net",
    "https://apac.smba.trafficmanager.net",
  ];

  const serviceUrl = claims.serviceurl;
  const isValidOrigin = expectedOrigins.some((origin) =>
    serviceUrl.startsWith(origin)
  );

  if (!isValidOrigin) {
    logger.warn(
      { serviceUrl, expectedOrigins, connectorProvider: "microsoft_bot" },
      "Invalid service URL in Teams webhook"
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request origin",
      },
      status_code: 403,
    });
  }

  logger.info(
    {
      connectorProvider: "microsoft_bot",
      appId: claims.aud,
      serviceUrl: claims.serviceUrl,
    },
    "Teams webhook validation passed"
  );

  try {
    await adapter.process(req, res, async (context) => {
      logger.info(
        {
          connectorProvider: "microsoft_bot",
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

      const localLogger = logger.child({
        connectorProvider: "microsoft_bot",
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
      });

      // Handle different activity types
      switch (context.activity.type) {
        case "message":
          if (context.activity.value?.verb) {
            await handleInteraction(context, connector, localLogger);
          } else {
            await handleMessage(context, connector, localLogger);
          }
          break;

        default:
          localLogger.info(
            {
              connectorProvider: connector.type,
              activityType: context.activity.type,
              connectorId: connector.id,
            },
            "Unhandled activity type"
          );
          break;
      }
    });
  } catch (error) {
    logger.error(
      { error, connectorProvider: "microsoft_bot" },
      "Error in Teams messages webhook"
    );
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleMessage(
  context: TurnContext,
  connector: ConnectorResource,
  localLogger: Logger,
  message?: string
) {
  message = message || context.activity.text;
  if (!message?.trim()) {
    return;
  }

  localLogger.info({ text: message }, "Handling regular text message");

  // Send thinking message
  const thinkingCard = createThinkingAdaptiveCard();

  localLogger.info(
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
  const thinkingActivity = await sendActivity(context, thinkingCard);
  if (thinkingActivity.isErr()) {
    localLogger.error(
      { error: thinkingActivity.error },
      "Error processing Teams message"
    );
    await sendActivity(
      context,
      createErrorAdaptiveCard({
        error: thinkingActivity.error.message,
        workspaceId: connector!.workspaceId,
      })
    );
    return;
  }

  localLogger.info(
    { activityId: thinkingActivity.value },
    "Successfully sent thinking card"
  );

  const result = await botAnswerMessage(
    context,
    message,
    connector,
    thinkingActivity.value
  );

  if (result.isErr()) {
    localLogger.error(
      { error: result.error },
      "Error processing Teams message"
    );
    await sendActivity(
      context,
      createErrorAdaptiveCard({
        error: result.error.message,
        workspaceId: connector!.workspaceId,
      })
    );
  }
}

async function handleInteraction(
  context: TurnContext,
  connector: ConnectorResource,
  localLogger: Logger
) {
  const { verb } = context.activity.value;

  localLogger.info({ verb }, "Handling interaction from adaptive card");

  switch (verb) {
    case "ask_agent":
      await handleAgentSelection(context, connector, localLogger);
      break;
    case "like":
      await sendFeedback({
        context,
        connector,
        thumbDirection: "up",
        localLogger,
      });
      break;
    case "dislike":
      await sendFeedback({
        context,
        connector,
        thumbDirection: "down",
        localLogger,
      });
      break;
    default:
      localLogger.info({ verb }, "Unhandled interaction verb");
      break;
  }
}

async function handleAgentSelection(
  context: TurnContext,
  connector: ConnectorResource,
  localLogger: Logger
) {
  const { selectedAgent, originalMessage } = context.activity.value;
  // Clean the message and add agent mention
  const cleanMessage = originalMessage
    .replace(/^[@+~][a-zA-Z0-9_-]+\s*/, "")
    .replace(/:mention\[([^\]]+)\]\{sId=([^}]+)\}/g, "")
    .trim();
  const agentMessage = `@${selectedAgent} ${cleanMessage}`;
  await handleMessage(context, connector, localLogger, agentMessage);
  localLogger.info(
    { selectedAgent, originalMessage },
    "Handling agent selection from adaptive card"
  );
}

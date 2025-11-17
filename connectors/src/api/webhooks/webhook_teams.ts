import type { TurnContext } from "botbuilder";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import type { Request, Response } from "express";

import {
  createErrorAdaptiveCard,
  createInteractiveToolApprovalAdaptiveCard,
  createThinkingAdaptiveCard,
  createWelcomeAdaptiveCard,
} from "@connectors/api/webhooks/teams/adaptive_cards";
import {
  botAnswerMessage,
  botValidateToolExecution,
  sendFeedback,
} from "@connectors/api/webhooks/teams/bot";
import {
  sendActivity,
  sendTextMessage,
  updateActivity,
} from "@connectors/api/webhooks/teams/bot_messaging_utils";
import {
  extractBearerToken,
  validateBotFrameworkToken,
} from "@connectors/api/webhooks/teams/jwt_validation";
import {
  getConnector,
  validateToolApprovalData,
} from "@connectors/api/webhooks/teams/utils";
import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

// CloudAdapter configuration - simplified for incoming message validation only
const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: apiConfig.getMicrosoftBotId(),
  MicrosoftAppPassword: apiConfig.getMicrosoftBotPassword(),
  MicrosoftAppType: "MultiTenant",
  MicrosoftAppTenantId: apiConfig.getMicrosoftBotTenantId(),
});

const adapter = new CloudAdapter(botFrameworkAuthentication);

// Error handler for the adapter
adapter.onTurnError = async (context, error) => {
  logger.error(
    {
      connectorProvider: "microsoft_bot",
      error: error.message,
      stack: error.stack,
      botId: apiConfig.getMicrosoftBotId(),
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
  const microsoftAppId = apiConfig.getMicrosoftBotId();
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

  try {
    await adapter.process(req, res, async (context) => {
      const { connector, tenantId } = await getConnector(context);

      const localLogger = logger.child({
        tenantId,
        activityType: context.activity.type,
        connectorProvider: "microsoft_bot",
        connectorId: connector?.id,
        workspaceId: connector?.workspaceId,
      });

      // Handle different activity types
      switch (context.activity.type) {
        case "message":
          if (!connector) {
            res.status(400).json({ error: "Connector not found" });
            return;
          }

          if (context.activity.value?.verb) {
            await handleInteraction(context, connector, localLogger);
          } else {
            await handleMessage(context, connector, localLogger);
          }
          break;
        case "invoke":
          if (!connector) {
            res.status(400).json({ error: "Connector not found" });
            return;
          }

          // Handle tool execution approval card refresh
          if (context.activity.value.action.verb === "toolExecutionApproval") {
            // Validate the data before using it
            const validatedData = validateToolApprovalData(
              context.activity.value.action.data
            );

            if (!validatedData) {
              localLogger.error(
                {
                  connectorId: connector.id,
                  receivedData: context.activity.value.action.data,
                },
                "Invalid tool approval data received for refresh"
              );
              res.status(400).json({ error: "Invalid request data" });
              break;
            }

            const cardResponse = {
              statusCode: 200,
              type: "application/vnd.microsoft.card.adaptive",
              value: createInteractiveToolApprovalAdaptiveCard(validatedData),
            };

            res.set("Content-Type", "application/json; charset=utf-8");
            res.status(200).json(cardResponse);
          } else {
            await handleToolApproval(context, connector, localLogger);
          }
          break;
        case "installationUpdate":
          if (context.activity.action === "add") {
            localLogger.info("Installed app from Microsoft Teams");

            if (apiConfig.getIsMicrosoftPrimaryRegion()) {
              await sendActivity(context, createWelcomeAdaptiveCard());
            }
          }

          if (context.activity.action === "remove") {
            localLogger.info("Uninstalled app from Microsoft Teams");
          }
          break;

        default:
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

  localLogger.info("Handling regular text message");

  // Send thinking message
  const thinkingCard = createThinkingAdaptiveCard();

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
        workspaceId: connector.workspaceId,
      })
    );
    return;
  }

  const result = await botAnswerMessage(
    context,
    message,
    connector,
    thinkingActivity.value,
    localLogger
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

async function handleToolApproval(
  context: TurnContext,
  connector: ConnectorResource,
  localLogger: Logger
) {
  const { verb } = context.activity.value.action;
  const approved = verb === "approve_tool" ? "approved" : "rejected";

  // Validate the data before using it
  const validatedData = validateToolApprovalData(
    context.activity.value.action.data
  );
  if (!validatedData) {
    localLogger.error(
      {
        connectorId: connector.id,
        receivedData: context.activity.value.action.data,
      },
      "Invalid tool approval data received"
    );
    return;
  }
  const {
    conversationId,
    messageId,
    actionId,
    microsoftBotMessageId,
    agentName,
    toolName,
  } = validatedData;

  localLogger.info(
    {
      conversationId,
      messageId,
      actionId,
      approved,
      agentName,
      toolName,
    },
    "Handling tool approval from adaptive card"
  );

  // Get the activity ID of the card that triggered this action
  const replyToId = context.activity.replyToId;

  const result = await botValidateToolExecution({
    context,
    connector,
    approved,
    conversationId,
    messageId,
    actionId,
    microsoftBotMessageId,
    localLogger,
  });

  if (result.isErr()) {
    localLogger.error(
      {
        error: result.error,
        conversationId,
        messageId,
        actionId,
      },
      "Error validating tool execution"
    );

    // Update the card with error message
    try {
      await updateActivity(context, {
        id: replyToId,
        type: "message",
        text: "❌ Failed to validate tool execution. Please try again.",
        attachments: [],
      });
    } catch (updateError) {
      localLogger.error(
        { error: updateError, replyToId },
        "Failed to update approval card with error"
      );
    }
  } else {
    // Update the card with success message, removing the buttons
    const resultText = `Agent **@${agentName}**'s request to use tool **${toolName}** was ${
      approved === "approved" ? "✅ approved" : "❌ rejected"
    }`;

    try {
      await updateActivity(context, {
        id: replyToId,
        type: "message",
        text: resultText,
        attachments: [],
      });

      localLogger.info(
        {
          conversationId,
          messageId,
          actionId,
          approved,
          replyToId,
        },
        "Tool approval completed and card disabled"
      );
    } catch (updateError) {
      localLogger.error(
        { error: updateError, replyToId },
        "Failed to update approval card with result"
      );
    }
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

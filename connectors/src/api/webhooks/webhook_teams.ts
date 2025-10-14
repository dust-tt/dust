import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";
import type { Request, Response } from "express";

import {
  extractBearerToken,
  generateTeamsRateLimitKey,
  validateBotFrameworkToken,
} from "@connectors/api/webhooks/teams/jwt_validation";
import { getConnector } from "@connectors/api/webhooks/teams/utils";
import { sendActivity } from "@connectors/api/webhooks/teams/bot_messaging_utils";
import logger from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";

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
      clientIp: req.ip,
    },
    "Received Teams messages webhook with details"
  );

  // Step 1: Validate Bot Framework JWT token
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    logger.warn("Missing or invalid Authorization header in Teams webhook");
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
    logger.error("MICROSOFT_BOT_ID environment variable not set");
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
    logger.warn({ microsoftAppId }, "Invalid Bot Framework JWT token");
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
      { serviceUrl, expectedOrigins },
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
      appId: claims.aud,
      serviceUrl: claims.serviceUrl,
      rateLimitKey: generateTeamsRateLimitKey(
        microsoftAppId,
        claims.serviceurl,
        req.ip
      ),
    },
    "Teams webhook validation passed"
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
          // TODO: Handle message
          logger.info(
            { activityType: context.activity.type },
            "Handling message"
          );
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

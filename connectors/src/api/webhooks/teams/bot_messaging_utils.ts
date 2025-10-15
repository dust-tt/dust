import axios from "axios";
import type { Activity, TurnContext } from "botbuilder";

import logger from "@connectors/logger/logger";
import { cacheWithRedis } from "@connectors/types/shared/cache";

/**
 * Utility functions to handle Teams bot messaging with reliable authentication
 * Replaces context.sendActivity and context.updateActivity with tenant-specific token approach
 */

/**
 * Raw token acquisition function (for caching)
 */
async function acquireTenantSpecificToken(): Promise<string> {
  if (
    !process.env.MICROSOFT_BOT_TENANT_ID ||
    !process.env.MICROSOFT_BOT_ID ||
    !process.env.MICROSOFT_BOT_PASSWORD
  ) {
    throw new Error(
      "Missing required environment variables: BOT_TENANT_ID, BOT_ID, BOT_PASSWORD"
    );
  }

  const tokenResponse = await axios.post(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_BOT_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.MICROSOFT_BOT_ID!,
      client_secret: process.env.MICROSOFT_BOT_PASSWORD!,
      scope: "https://api.botframework.com/.default",
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  logger.info(
    {
      tokenType: tokenResponse.data.token_type,
      expiresIn: tokenResponse.data.expires_in,
    },
    "Tenant-specific token acquired"
  );

  return tokenResponse.data.access_token;
}

/**
 * Cached version of token acquisition using Redis
 * Cache for 50 minutes (tokens expire in 1 hour, 10-minute buffer)
 */
const getCachedTenantToken = cacheWithRedis(
  acquireTenantSpecificToken,
  () =>
    `teams-bot-token-${process.env.MICROSOFT_BOT_ID}-${process.env.MICROSOFT_BOT_TENANT_ID}`,
  {
    ttlMs: 50 * 60 * 1000, // 50 minutes
  }
);

/**
 * Acquire tenant-specific token for Bot Framework API calls
 */
async function getTenantSpecificToken(): Promise<string | null> {
  try {
    return await getCachedTenantToken();
  } catch (error) {
    logger.error({ error }, "Failed to acquire tenant-specific token");
    return null;
  }
}

/**
 * Reliable replacement for context.sendActivity()
 * Uses tenant-specific token for authentication
 */
export async function sendActivity(
  context: TurnContext,
  activity: Partial<Activity>
): Promise<{ id?: string } | undefined> {
  const token = await getTenantSpecificToken();
  if (!token) {
    logger.error("Cannot send activity - no valid token");
    return undefined;
  }

  try {
    const response = await axios.post(
      `${context.activity.serviceUrl}/v3/conversations/${context.activity.conversation.id}/activities`,
      activity,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    logger.debug(
      {
        activityId: response.data?.id,
        statusCode: response.status,
      },
      "Activity sent successfully"
    );

    return { id: response.data?.id };
  } catch (error) {
    logger.error(
      {
        error,
        serviceUrl: context.activity.serviceUrl,
        conversationId: context.activity.conversation?.id,
      },
      "Failed to send activity"
    );
    throw error;
  }
}

import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import axios from "axios";
import type { Activity, TurnContext } from "botbuilder";

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

  return tokenResponse.data.access_token;
}

/**
 * Cached version of token acquisition using Redis
 * Cache for 50 minutes (tokens expire in 1 hour, 10-minute buffer)
 */
export const getTenantSpecificToken: () => Promise<string> = cacheWithRedis(
  acquireTenantSpecificToken,
  () =>
    `teams-bot-token-${process.env.MICROSOFT_BOT_ID}-${process.env.MICROSOFT_BOT_TENANT_ID}`,
  {
    ttlMs: 50 * 60 * 1000, // 50 minutes
  }
);

/**
 * Reliable replacement for context.sendActivity()
 * Uses tenant-specific token for authentication
 */
export async function sendActivity(
  context: TurnContext,
  activity: Partial<Activity>
): Promise<Result<string, Error>> {
  const token = await getTenantSpecificToken();

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

  if (response.data?.id) {
    return new Ok(response.data.id);
  }

  return new Err(new Error("Cannot send activity - no activity ID"));
}

/**
 * Reliable replacement for context.updateActivity()
 * Uses tenant-specific token for authentication
 */
export async function updateActivity(
  context: TurnContext,
  activity: Partial<Activity>
): Promise<Result<void, Error>> {
  const token = await getTenantSpecificToken();

  if (!activity.id) {
    return new Err(
      new Error("Cannot update activity - no activity ID provided")
    );
  }

  await axios.put(
    `${context.activity.serviceUrl}/v3/conversations/${context.activity.conversation.id}/activities/${activity.id}`,
    activity,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return new Ok(undefined);
}

/**
 * Helper function to send a text message
 */
export async function sendTextMessage(
  context: TurnContext,
  text: string
): Promise<Result<string, Error>> {
  return sendActivity(context, {
    type: "message",
    text,
  });
}

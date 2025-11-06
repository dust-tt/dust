import type { Result } from "@dust-tt/client";
import { Err, normalizeError, Ok } from "@dust-tt/client";
import axios from "axios";
import type { Activity, TurnContext } from "botbuilder";

import { apiConfig } from "@connectors/lib/api/config";
import { cacheWithRedis } from "@connectors/types/shared/cache";

/**
 * Utility functions to handle Teams bot messaging with reliable authentication
 * Replaces context.sendActivity and context.updateActivity with tenant-specific token approach
 */

/**
 * Raw token acquisition function (for caching)
 */
async function acquireTenantSpecificToken(): Promise<string> {
  const tokenResponse = await axios.post(
    `https://login.microsoftonline.com/${apiConfig.getMicrosoftBotTenantId()}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiConfig.getMicrosoftBotId() || "",
      client_secret: apiConfig.getMicrosoftBotPassword() || "",
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
  () => `teams-bot-token`,
  {
    ttlMs: 50 * 60 * 1000, // 50 minutes
  }
);

/**
 * Handles 429 (Too Many Requests) errors from Microsoft Bot Framework
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  retryCount = 0,
  maxRetries = 3
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Handle rate limiting with exponential backoff
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      if (retryCount < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const backoffMs = 500 * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return withRetry(operation, retryCount + 1, maxRetries);
      }
      throw new Error(
        `Rate limit exceeded after ${maxRetries} retries (429 Too Many Requests)`
      );
    }
    throw error;
  }
}

/**
 * Reliable replacement for context.sendActivity()
 * Uses tenant-specific token for authentication with automatic retry on rate limits
 * @param skipRetry - If true, don't retry on errors (useful for streaming updates)
 */
export async function sendActivity(
  context: TurnContext,
  activity: Partial<Activity>,
  skipRetry = false
): Promise<Result<string, Error>> {
  try {
    const operation = async () => {
      const token = await getTenantSpecificToken();

      return axios.post(
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
    };

    const response = skipRetry ? await operation() : await withRetry(operation);

    if (response.data?.id) {
      return new Ok(response.data.id);
    }

    return new Err(new Error("Cannot send activity - no activity ID"));
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Reliable replacement for context.updateActivity()
 * Uses tenant-specific token for authentication with automatic retry on rate limits
 * @param skipRetry - If true, don't retry on errors (useful for streaming updates)
 */
export async function updateActivity(
  context: TurnContext,
  activity: Partial<Activity>,
  skipRetry = false
): Promise<Result<string, Error>> {
  if (!activity.id) {
    return new Err(
      new Error("Cannot update activity - no activity ID provided")
    );
  }

  try {
    const operation = async () => {
      const token = await getTenantSpecificToken();

      return axios.put(
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
    };

    const response = skipRetry ? await operation() : await withRetry(operation);

    if (response.data?.id) {
      return new Ok(response.data.id);
    }

    return new Err(new Error("Cannot update activity - no activity ID"));
  } catch (error) {
    return new Err(normalizeError(error));
  }
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

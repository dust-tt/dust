import { WebClient } from "@slack/web-api";

import {
  isSlackWebAPIPlatformError,
  isWebAPIHTTPError,
  isWebAPIPlatformError,
  isWebAPIRateLimitedError,
} from "@connectors/connectors/slack/lib/errors";
import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import {
  ExternalOAuthTokenError,
  ProviderRateLimitError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import { throttleWithRedis } from "@connectors/lib/throttle";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

// Timeout in ms for all network requests;
const SLACK_NETWORK_TIMEOUT_MS = 30000;

export function reportSlackUsage({
  connectorId,
  method,
  useCase,
}: {
  connectorId: ModelId;
  method: string;
  channelId?: string;
  limit?: number;
  useCase?: "batch_sync" | "incremental_sync" | "bot";
}) {
  const tags = [`connector:${connectorId}`, `method:${method}`];
  if (useCase) {
    tags.push(`use_case:${useCase}`);
  }
  statsDClient.increment("slack_api_call.count", 1, tags);
}

interface SlackClientOptions {
  rejectOnRateLimit?: boolean;
}

/**
 * Creates a Slack WebClient instance for making API calls.
 *
 * IMPORTANT: When using this client in Temporal activities, wrap all API calls
 * with `withSlackErrorHandling()` to properly convert Slack errors to workflow errors
 * (rate limits, auth errors, etc.) that can be handled by Temporal interceptors.
 *
 * @example
 * ```typescript
 * const slackClient = await getSlackClient(connectorId);
 *
 * // ✅ Correct usage in Temporal activities:
 * const result = await withSlackErrorHandling(() =>
 *   slackClient.conversations.list({ types: "public_channel" })
 * );
 *
 * // ❌ Incorrect usage in Temporal activities (raw Slack errors won't be converted):
 * const result = await slackClient.conversations.list({ types: "public_channel" });
 * ```
 */
export async function getSlackClient(
  connectorId: ModelId,
  options?: SlackClientOptions
): Promise<WebClient>;
export async function getSlackClient(
  slackAccessToken: string,
  options?: SlackClientOptions
): Promise<WebClient>;
export async function getSlackClient(
  connectorIdOrAccessToken: string | ModelId,
  options?: SlackClientOptions
): Promise<WebClient> {
  let slackAccessToken: string | undefined = undefined;
  if (typeof connectorIdOrAccessToken === "number") {
    const connector = await ConnectorResource.fetchById(
      connectorIdOrAccessToken
    );
    if (!connector) {
      throw new Error(`Could not find connector ${connectorIdOrAccessToken}`);
    }
    slackAccessToken = await getSlackAccessToken(connector.connectionId);
  } else {
    slackAccessToken = connectorIdOrAccessToken;
  }

  // By default, we want to reject on rate limit errors.
  const { rejectOnRateLimit = true } = options ?? {};

  const slackClient = new WebClient(slackAccessToken, {
    timeout: SLACK_NETWORK_TIMEOUT_MS,
    rejectRateLimitedCalls: rejectOnRateLimit,
    retryConfig: rejectOnRateLimit
      ? undefined
      : {
          retries: 5,
          factor: 2,
        },
  });

  return slackClient;
}

export async function withSlackErrorHandling<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (e) {
    // Convert Slack errors to proper workflow errors.

    // Rate limit errors.
    if (isWebAPIRateLimitedError(e)) {
      throw new ProviderRateLimitError(
        `Rate limited: ${e.message} (retry after ${e.retryAfter}s)`,
        e,
        // Slack returns retryAfter in seconds, but Temporal expects milliseconds.
        e.retryAfter * 1000
      );
    }

    // HTTP 503 errors (Slack is down).
    if (isWebAPIHTTPError(e) && e.statusCode === 503) {
      throw new ProviderWorkflowError(
        "slack",
        `Slack is down: ${e.statusMessage}`,
        "transient_upstream_activity_error",
        e
      );
    }

    // Platform errors (auth issues).
    if (
      isWebAPIPlatformError(e) &&
      ["account_inactive", "invalid_auth", "missing_scope"].includes(
        e.data.error
      )
    ) {
      throw new ExternalOAuthTokenError();
    }

    // Pass through everything else unchanged.
    throw e;
  }
}

export type SlackUserInfo = {
  email: string | null;
  is_bot: boolean;
  display_name?: string;
  real_name?: string;
  is_restricted: boolean;
  is_stranger: boolean;
  is_ultra_restricted: boolean;
  teamId: string | null;
  tz: string | null;
  image_512: string | null;
  name: string | null;
};

export const getSlackUserInfoMemoized = cacheWithRedis(
  _getSlackUserInfo,
  (connectorId, slackClient, userId) =>
    `slack-userid2name-${connectorId}-${userId}`,
  {
    ttlMs: 60 * 60 * 1000,
  }
);

async function _getSlackUserInfo(
  connectorId: ModelId,
  slackClient: WebClient,
  userId: string
): Promise<SlackUserInfo> {
  reportSlackUsage({
    connectorId,
    method: "users.info",
  });
  try {
    const res = await throttleWithRedis(
      RATE_LIMITS["users.info"],
      `${connectorId}-users-info`,
      false,
      () => slackClient.users.info({ user: userId }),
      { source: "getSlackUserInfo" }
    );

    if (!res) {
      throw new Error("Failed to get Slack user info");
    }

    if (!res.ok) {
      throw res.error;
    }

    return {
      // Slack has two concepts for bots:
      // - Bots, that you can get through slackClient.bots.info() and
      // - User bots, which are the users related to a bot.
      // For example, slack workflows are bots, and the Zapier Slack bot is a user bot.
      // Not clear why Slack has these two concepts.
      // From our perspective, a Slack user bot is a bot.
      is_bot: res.user?.is_bot || false,
      email: res.user?.profile?.email || null,
      display_name: res.user?.profile?.display_name,
      real_name: res.user?.profile?.real_name,
      is_restricted: res.user?.is_restricted || false,
      is_stranger: res.user?.is_stranger || false,
      is_ultra_restricted: res.user?.is_ultra_restricted || false,
      teamId: res.user?.team_id || null,
      tz: res.user?.tz || null,
      image_512: res.user?.profile?.image_512 || null,
      name: res.user?.name || null,
    };
  } catch (err) {
    if (isSlackWebAPIPlatformError(err)) {
      if (err.data.error === "user_not_found") {
        logger.info({ connectorId, userId }, "Slack user not found.");
      }
    }
    throw err;
  }
}

export async function getSlackBotInfo(
  connectorId: ModelId,
  slackClient: WebClient,
  botId: string
): Promise<SlackUserInfo> {
  reportSlackUsage({
    connectorId,
    method: "bots.info",
  });
  const slackBot = await slackClient.bots.info({ bot: botId });
  if (slackBot.error) {
    throw slackBot.error;
  }
  if (!slackBot.bot?.name) {
    throw new Error(`Slack bot with id ${botId} has no name`);
  }

  return {
    display_name: slackBot.bot?.name,
    real_name: slackBot.bot.name,
    email: null,
    image_512: slackBot.bot?.icons?.image_72 || null,
    tz: null,
    is_restricted: false,
    is_stranger: false,
    is_ultra_restricted: false,
    is_bot: true,
    teamId: null,
    name: slackBot.bot?.name || null,
  };
}

export async function getSlackConversationInfo(
  connectorId: ModelId,
  slackClient: WebClient,
  channelId: string
) {
  reportSlackUsage({
    connectorId,
    method: "conversations.info",
    channelId,
  });
  return slackClient.conversations.info({ channel: channelId });
}

export async function getSlackAccessToken(
  connectionId: string
): Promise<string> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "slack",
    connectionId,
  });

  return token.access_token;
}

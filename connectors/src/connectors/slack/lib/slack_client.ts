import type {
  CodedError,
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebAPIRateLimitedError,
} from "@slack/web-api";
import { ErrorCode, WebClient } from "@slack/web-api";

import {
  ExternalOAuthTokenError,
  ProviderRateLimitError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

// Timeout in ms for all network requests;
const SLACK_NETWORK_TIMEOUT_MS = 30000;

function isCodedError(error: unknown): error is CodedError {
  return error != null && typeof error === "object" && "code" in error;
}

// Type guards for Slack errors
// See https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/errors.ts.
function isWebAPIRateLimitedError(
  error: unknown
): error is WebAPIRateLimitedError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.RateLimitedError &&
    "retryAfter" in error &&
    typeof error.retryAfter === "number"
  );
}

function isWebAPIHTTPError(error: unknown): error is WebAPIHTTPError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.HTTPError &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

function isWebAPIPlatformError(error: unknown): error is WebAPIPlatformError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.PlatformError &&
    "data" in error &&
    error.data != null &&
    typeof error.data === "object" &&
    "error" in error.data &&
    typeof error.data.error === "string"
  );
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
  options?: { rejectRateLimitedCalls?: boolean }
): Promise<WebClient>;
export async function getSlackClient(
  slackAccessToken: string,
  options?: { rejectRateLimitedCalls?: boolean }
): Promise<WebClient>;
export async function getSlackClient(
  connectorIdOrAccessToken: string | ModelId,
  options: { rejectRateLimitedCalls?: boolean } = {
    rejectRateLimitedCalls: true,
  }
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
  const slackClient = new WebClient(slackAccessToken, {
    timeout: SLACK_NETWORK_TIMEOUT_MS,
    rejectRateLimitedCalls: options.rejectRateLimitedCalls ?? true,
    retryConfig: {
      retries: 1,
      factor: 1,
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
  real_name: string;
  is_restricted: boolean;
  is_stranger: boolean;
  is_ultra_restricted: boolean;
  teamId: string | null;
  tz: string | null;
  image_512: string | null;
};

export async function getSlackUserInfo(
  slackClient: WebClient,
  userId: string
): Promise<SlackUserInfo> {
  const res = await slackClient.users.info({ user: userId });

  if (!res.ok) {
    throw res.error;
  }

  if (!res.user?.profile?.real_name) {
    throw new Error(`Slack user with id ${userId} has no real name`);
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
    real_name: res.user.profile.real_name,
    is_restricted: res.user?.is_restricted || false,
    is_stranger: res.user?.is_stranger || false,
    is_ultra_restricted: res.user?.is_ultra_restricted || false,
    teamId: res.user?.team_id || null,
    tz: res.user?.tz || null,
    image_512: res.user?.profile?.image_512 || null,
  };
}

export async function getSlackBotInfo(
  slackClient: WebClient,
  botId: string
): Promise<SlackUserInfo> {
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
  };
}

export async function getSlackConversationInfo(
  slackClient: WebClient,
  channelId: string
) {
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

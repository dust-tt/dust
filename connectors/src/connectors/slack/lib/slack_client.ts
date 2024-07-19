import type { ModelId } from "@dust-tt/types";
import { getOAuthConnectionAccessToken } from "@dust-tt/types";
import type {
  CodedError,
  WebAPIHTTPError,
  WebAPIPlatformError,
} from "@slack/web-api";
import { ErrorCode, WebClient } from "@slack/web-api";

import {
  ExternalOauthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { isDualUseOAuthConnectionId } from "@connectors/lib/oauth";
import { ConnectorResource } from "@connectors/resources/connector_resource";
const { NANGO_SLACK_CONNECTOR_ID } = process.env;
import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";

// Timeout in ms for all network requests;
const SLACK_NETWORK_TIMEOUT_MS = 30000;

export async function getSlackClient(connectorId: ModelId): Promise<WebClient>;
export async function getSlackClient(
  slackAccessToken: string
): Promise<WebClient>;
export async function getSlackClient(
  connectorIdOrAccessToken: string | ModelId
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
    retryConfig: {
      retries: 1,
      factor: 1,
    },
  });

  const handler: ProxyHandler<WebClient> = {
    get: function (target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (["function", "object"].indexOf(typeof value) > -1) {
        return new Proxy(value, handler);
      }

      return Reflect.get(target, prop, receiver);
    },
    apply: async function (target, thisArg, argumentsList) {
      try {
        // @ts-expect-error can't get typescript to be happy with this, but it works.
        // eslint-disable-next-line @typescript-eslint/return-await
        return await Reflect.apply(target, thisArg, argumentsList);
      } catch (e) {
        // If we get rate limited, we throw a known error.
        // Note: a previous version using slackError.code === ErrorCode.RateLimitedError failed
        // see PR #2689 for details
        if (
          e instanceof Error &&
          e.message.startsWith("A rate limit was exceeded")
        ) {
          throw new ProviderWorkflowError(
            "slack",
            `Rate limited: ${e.message}`,
            "rate_limit_error",
            e
          );
        }

        const slackError = e as CodedError;
        if (slackError.code === ErrorCode.HTTPError) {
          const httpError = slackError as WebAPIHTTPError;
          if (httpError.statusCode === 503) {
            throw new ProviderWorkflowError(
              "slack",
              `Slack is down: ${httpError.message}`,
              "transient_upstream_activity_error",
              httpError
            );
          }
        }
        if (slackError.code === ErrorCode.PlatformError) {
          const platformError = e as WebAPIPlatformError;
          if (
            ["account_inactive", "invalid_auth"].includes(
              platformError.data.error
            )
          ) {
            throw new ExternalOauthTokenError();
          }
        }
        throw e;
      }
    },
  };

  const proxied = new Proxy(slackClient, handler);

  return proxied;
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
};

export async function getSlackUserInfo(
  slackClient: WebClient,
  userId: string
): Promise<SlackUserInfo> {
  const res = await slackClient.users.info({ user: userId });

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

  return {
    display_name: slackBot.bot?.name,
    real_name: slackBot.bot?.name,
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
  if (isDualUseOAuthConnectionId(connectionId)) {
    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider: "slack",
      connectionId,
    });
    if (tokRes.isErr()) {
      logger.error(
        { connectionId, error: tokRes.error },
        "Error retrieving Slack access token"
      );
      throw new Error("Error retrieving Slack access token");
    }

    return tokRes.value.access_token;
  } else {
    // TODO(spolu) SLACK_MIGRATION remove once migrated
    if (!NANGO_SLACK_CONNECTOR_ID) {
      throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
    }
    return getAccessTokenFromNango({
      connectionId: connectionId,
      integrationId: NANGO_SLACK_CONNECTOR_ID,
      useCache: true,
    });
  }
}

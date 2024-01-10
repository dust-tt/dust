import { ModelId } from "@dust-tt/types";
import {
  CodedError,
  ErrorCode,
  UsersInfoResponse,
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebClient,
} from "@slack/web-api";

import { ExternalOauthTokenError, WorkflowError } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
const { NANGO_SLACK_CONNECTOR_ID } = process.env;

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
    const connector = await Connector.findByPk(connectorIdOrAccessToken);
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
          throw {
            __is_dust_error: true,
            message: e.message,
            triggeringError: e,
            type: "connector_rate_limit_error",
          };
        }

        const slackError = e as CodedError;
        if (slackError.code === ErrorCode.HTTPError) {
          const httpError = slackError as WebAPIHTTPError;
          if (httpError.statusCode === 503) {
            const workflowError: WorkflowError = {
              type: "upstream_is_down_activity_error",
              message: `Slack is down: ${httpError.message}`,
              __is_dust_error: true,
            };
            throw workflowError;
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

export async function getSlackUserInfo(slackClient: WebClient, userId: string) {
  return slackClient.users.info({
    user: userId,
  });
}

async function getSlackConversationInfo(
  slackClient: WebClient,
  channelId: string
) {
  return slackClient.conversations.info({ channel: channelId });
}

// Verify the Slack user is not an external guest to the workspace.
// An exception is made for users from domains on the whitelist,
// allowing them to interact with the bot in public channels.
// See incident: https://dust4ai.slack.com/archives/C05B529FHV1/p1704799263814619
export async function isUserAllowedToUseChatbot(
  slackClient: WebClient,
  slackUserInfo: UsersInfoResponse,
  slackChanneId: string,
  slackTeamId: string,
  whitelistedDomains?: readonly string[]
): Promise<boolean> {
  if (!slackUserInfo.user) {
    return false;
  }

  const {
    is_restricted,
    is_stranger: isStranger,
    is_ultra_restricted,
    profile,
  } = slackUserInfo.user;

  const isInWorkspace = profile?.team === slackTeamId;
  if (!isInWorkspace) {
    return false;
  }

  const isGuest = is_restricted || is_ultra_restricted;
  const isExternal = isGuest || isStranger;

  if (isExternal) {
    const userDomain = profile?.email?.split("@")[1];
    // Ensure the domain matches exactly.
    const isWhitelistedDomain = userDomain
      ? whitelistedDomains?.includes(userDomain) ?? false
      : false;

    const slackConversationInfo = await getSlackConversationInfo(
      slackClient,
      slackChanneId
    );

    const isChannelPublic = !slackConversationInfo.channel?.is_private;
    return isChannelPublic && isWhitelistedDomain;
  }

  return true;
}

export async function getSlackAccessToken(
  nangoConnectionId: string
): Promise<string> {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
  }
  return getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_SLACK_CONNECTOR_ID,
    useCache: true,
  });
}

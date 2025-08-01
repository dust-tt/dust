import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

import {
  isSlackWebAPIPlatformError,
  isSlackWebAPIPlatformErrorBotNotFound,
} from "@connectors/connectors/slack/lib/errors";
import {
  getSlackBotInfo,
  reportSlackUsage,
} from "@connectors/connectors/slack/lib/slack_client";
import { cacheGet, cacheSet } from "@connectors/lib/cache";
import logger from "@connectors/logger/logger";
import type { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

const BOT_NAME_CACHE_TTL = 60 * 10 * 1000; // 10 minutes.

async function getBotUserId(
  slackClient: WebClient,
  connectorId: ModelId
): Promise<string> {
  reportSlackUsage({
    connectorId,
    method: "auth.test",
  });
  const authRes = await slackClient.auth.test({});
  if (authRes.error) {
    throw new Error(`Failed to fetch auth info: ${authRes.error}`);
  }
  if (!authRes.user_id) {
    throw new Error(`Failed to fetch auth info: user_id is undefined`);
  }

  return authRes.user_id;
}

export const getBotUserIdMemoized = cacheWithRedis(
  getBotUserId,
  (slackClient, connectorId) => connectorId.toString(),
  {
    ttlMs: 60 * 10 * 1000,
  }
);

export async function getUserName(
  slackUserId: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string | null> {
  const fromCache = await cacheGet(getUserCacheKey(slackUserId, connectorId));
  if (fromCache) {
    return fromCache;
  }

  try {
    reportSlackUsage({
      connectorId,
      method: "users.info",
    });
    const info = await slackClient.users.info({ user: slackUserId });

    if (info && info.user) {
      const displayName = info.user.profile?.display_name;
      const realName = info.user.profile?.real_name;
      const userName = displayName || realName || info.user.name;

      if (userName) {
        await cacheSet(getUserCacheKey(slackUserId, connectorId), userName);
        return userName;
      }
    }

    return null;
  } catch (err) {
    if (isSlackWebAPIPlatformError(err)) {
      if (err.data.error === "user_not_found") {
        logger.info({ connectorId, slackUserId }, "Slack user not found.");

        return null;
      }
    }

    throw err;
  }
}

export function getUserCacheKey(userId: string, connectorId: ModelId) {
  return `slack-userid2name-${connectorId}-${userId}`;
}

export function shouldIndexSlackMessage(
  slackConfiguration: SlackConfigurationResource,
  messageElement: MessageElement,
  slackClient: WebClient
) {
  if (messageElement.user) {
    return true;
  }

  return isWhitelistedBotOrWorkflow(
    slackConfiguration,
    messageElement,
    slackClient
  );
}

/**
 * Bots.
 */

async function getBotName({
  botId,
  connectorId,
  slackClient,
}: {
  botId: string;
  connectorId: ModelId;
  slackClient: WebClient;
}): Promise<string | null> {
  try {
    const slackBotOrWorkflowInfo = await getSlackBotInfo(
      connectorId,
      slackClient,
      botId
    );

    // Return null instead of undefined to avoid Redis "Invalid argument type" error
    // when caching the result - undefined cannot be JSON.stringified properly for Redis storage.
    return slackBotOrWorkflowInfo.display_name ?? null;
  } catch (err) {
    if (isSlackWebAPIPlatformErrorBotNotFound(err)) {
      logger.info(
        {
          botId,
          connectorId,
        },
        "Slack bot not found, skipping message"
      );

      // Return null instead of undefined to avoid Redis "Invalid argument type" error
      // when caching the result - undefined cannot be JSON.stringified properly for Redis storage.
      return null;
    }

    logger.error(
      {
        err,
        botId,
        connectorId,
      },
      "Failed to get Slack bot info"
    );

    throw err;
  }
}

export const getBotNameMemoized = cacheWithRedis(
  getBotName,
  ({ botId, connectorId }) => `slack-bot-name-${connectorId}-${botId}`,
  {
    ttlMs: BOT_NAME_CACHE_TTL,
  }
);

export async function isWhitelistedBotOrWorkflow(
  slackConfiguration: SlackConfigurationResource,
  messageElement: MessageElement,
  slackClient: WebClient
) {
  const { bot_id: botId, bot_profile: botProfile } = messageElement;
  if (!botId && !botProfile) {
    return false;
  }

  const botName = botProfile?.name;
  if (botName) {
    return slackConfiguration.isBotWhitelistedToIndexMessages(botName);
  }

  // If bot name is not provided, attempt to fetch it from the API.
  if (botId) {
    const botName = await getBotNameMemoized({
      botId,
      connectorId: slackConfiguration.connectorId,
      slackClient,
    });

    return botName
      ? slackConfiguration.isBotWhitelistedToIndexMessages(botName)
      : false;
  }

  return false;
}

export async function getBotOrUserName(
  message: MessageElement,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string | null> {
  return message.bot_id
    ? getBotNameMemoized({ botId: message.bot_id, connectorId, slackClient })
    : getUserName(message.user as string, connectorId, slackClient);
}

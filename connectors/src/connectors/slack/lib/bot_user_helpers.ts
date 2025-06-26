import type { WebClient } from "@slack/web-api";

import { isSlackWebAPIPlatformError } from "@connectors/connectors/slack/lib/errors";
import { reportSlackUsage } from "@connectors/connectors/slack/lib/slack_client";
import { cacheGet, cacheSet } from "@connectors/lib/cache";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

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
  60 * 10 * 1000
);

export async function getUserName(
  slackUserId: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string | undefined> {
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
        return info.user.name;
      }
    }

    return undefined;
  } catch (err) {
    if (isSlackWebAPIPlatformError(err)) {
      if (err.data.error === "user_not_found") {
        logger.info({ connectorId, slackUserId }, "Slack user not found.");

        return undefined;
      }
    }

    throw err;
  }
}

export function getUserCacheKey(userId: string, connectorId: ModelId) {
  return `slack-userid2name-${connectorId}-${userId}`;
}

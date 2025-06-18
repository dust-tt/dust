import type { WebClient } from "@slack/web-api";

import { reportSlackUsage } from "@connectors/connectors/slack/lib/slack_client";
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

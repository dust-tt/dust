import type { ModelId, Result } from "@dust-tt/types";
import {
  cacheWithRedis,
  DustAPI,
  Err,
  Ok,
  RateLimitError,
} from "@dust-tt/types";

import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  addEntityToRateLimiter,
  isEntityRateLimited,
} from "@connectors/lib/entity_rate_limiter";
import type { Connector } from "@connectors/lib/models";
import { redisClient } from "@connectors/lib/redis";
import logger from "@connectors/logger/logger";

export async function safeRedisClient<T>(
  fn: (client: Awaited<ReturnType<typeof redisClient>>) => PromiseLike<T>
): Promise<T> {
  const client = await redisClient();
  try {
    return await fn(client);
  } finally {
    await client.quit();
  }
}

async function getActiveMembersCount(connector: Connector): Promise<number> {
  const ds = dataSourceConfigFromConnector(connector);

  // The number of active members in the workspace.
  const dustAPI = new DustAPI(
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );

  const membersRes = await dustAPI.getAllMembersInWorkspace();
  if (membersRes.isErr()) {
    logger.error("Error getting all members in workspace.", {
      error: membersRes.error,
    });

    throw new Error("Error getting all members in workspace.");
  }

  return membersRes.value.length;
}

function makeSlackRateLimiterForConnectoreKey(connectorId: ModelId): string {
  return `slack-rate-limiter-connector-${connectorId}`;
}

export const getActiveMembersCountMemoized = cacheWithRedis(
  getActiveMembersCount,
  (connector: Connector) => {
    return `active-members-connector-${connector.id}`;
  },
  // Caches data for 15 minutes to limit frequent fetches.
  // Note: Updates (e.g., new seats added by an admin) may take up to 15 minutes to be reflected.
  15 * 10 * 1000
);

async function postWorkspaceRateLimitedMessage(
  connector: Connector,
  {
    slackChannel,
    slackMessageTs,
    maxAllowed,
  }: { slackChannel: string; slackMessageTs: string; maxAllowed: number }
) {
  const slackClient = await getSlackClient(connector.id);
  await slackClient.chat.postMessage({
    channel: slackChannel,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Your Slack integration is limited to the number of active members in your workspace, which is currently ${maxAllowed} users. To allow more users to access the app, please increase your active member count.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Add More Seats",
              emoji: true,
            },
            style: "primary",
            value: "add_more_seats_cta",
            action_id: "actionId-0",
            url: `https://dust.tt/w/${connector.workspaceId}/members`,
          },
        ],
      },
    ],
    thread_ts: slackMessageTs,
  });
}

export async function notifyIfUserRateLimited(
  connector: Connector,
  {
    slackUserId,
    slackChannel,
    slackMessageTs,
  }: { slackUserId: string; slackChannel: string; slackMessageTs: string }
): Promise<boolean> {
  const maxAllowed = 1;
  await getActiveMembersCountMemoized(connector);
  const connectorRateLimiterKey = makeSlackRateLimiterForConnectoreKey(
    connector.id
  );
  const rateLimiterOptions = {
    key: connectorRateLimiterKey,
    windowSizeInSeconds: 86400, // 24 hours.
    maxAllowed,
  };

  return safeRedisClient(async (redis) => {
    const isRateLimited = await isEntityRateLimited(slackUserId, {
      redis,
      ...rateLimiterOptions,
    });

    if (isRateLimited) {
      await postWorkspaceRateLimitedMessage(connector, {
        slackChannel,
        slackMessageTs,
        maxAllowed,
      });

      logger.error("Workspace rate limited.", {
        maxAllowed,
        connectorId: connector.id,
        slackUserId,
      });

      return true;
    } else {
      await addEntityToRateLimiter(slackUserId, {
        redis,
        ...rateLimiterOptions,
      });

      return false;
    }
  });
}

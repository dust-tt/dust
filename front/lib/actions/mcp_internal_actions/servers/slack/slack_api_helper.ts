import { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import type { Member } from "@slack/web-api/dist/response/UsersListResponse";
import slackifyMarkdown from "slackify-markdown";

import { makeMCPToolJSONSuccess } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { removeDiacritics } from "@app/lib/utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { getAgentRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";

export const getSlackClient = async (accessToken?: string) => {
  if (!accessToken) {
    throw new Error("No access token provided");
  }

  return new WebClient(accessToken, {
    timeout: 10000,
    rejectRateLimitedCalls: false,
    retryConfig: {
      retries: 1,
      factor: 1,
    },
  });
};

type GetPublicChannelsArgs = {
  mcpServerId: string;
  slackClient: WebClient;
};

type ChannelWithIdAndName = Omit<Channel, "id" | "name"> & {
  id: string;
  name: string;
};

const _getPublicChannels = async ({
  slackClient,
}: GetPublicChannelsArgs): Promise<ChannelWithIdAndName[]> => {
  const channels: Channel[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.conversations.list({
      cursor,
      limit: 100,
      exclude_archived: true,
      types: "public_channel",
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    channels.push(...(response.channels ?? []));
    cursor = response.response_metadata?.next_cursor;

    // We can't handle a huge list of channels, and even if we could, it would be unusable
    // in the UI. So we arbitrarily cap it to 500 channels.
    if (channels.length >= 500) {
      logger.warn("Channel list truncated after reaching over 500 channels.");
      break;
    }
  } while (cursor);

  return channels
    .filter((c) => !!c.id && !!c.name)
    .map((c) => ({
      ...c,
      id: c.id!,
      name: c.name!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getCachedPublicChannels = cacheWithRedis(
  _getPublicChannels,
  ({ mcpServerId }: GetPublicChannelsArgs) => mcpServerId,
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);

// Post message function
export async function executePostMessage(
  to: string,
  message: string,
  threadTs: string | undefined,
  accessToken: string,
  agentLoopContext: AgentLoopContextType,
  auth: Authenticator
) {
  const slackClient = await getSlackClient(accessToken);
  const originalMessage = message;

  const agentUrl = getAgentRoute(
    auth.getNonNullableWorkspace().sId,
    "new",
    `agentDetails=${agentLoopContext.runContext?.agentConfiguration.sId}`,
    config.getClientFacingUrl()
  );
  message = `${slackifyMarkdown(originalMessage)}\n_Sent via <${agentUrl}|${agentLoopContext.runContext?.agentConfiguration.name} Agent> on Dust_`;

  const response = await slackClient.chat.postMessage({
    channel: to,
    text: message,
    mrkdwn: true,
    thread_ts: threadTs,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return makeMCPToolJSONSuccess({
    message: `Message posted to ${to}`,
    result: response,
  });
}

export async function executeListUsers(
  nameFilter: string | undefined,
  accessToken: string
) {
  const slackClient = await getSlackClient(accessToken);
  const users: Member[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.users.list({
      cursor,
      limit: 100,
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    users.push(...(response.members ?? []).filter((member) => !member.is_bot));
    cursor = response.response_metadata?.next_cursor;

    if (nameFilter) {
      const normalizedNameFilter = removeDiacritics(nameFilter.toLowerCase());
      const filteredUsers = users.filter(
        (user) =>
          removeDiacritics(user.name?.toLowerCase() ?? "").includes(
            normalizedNameFilter
          ) ||
          removeDiacritics(user.real_name?.toLowerCase() ?? "").includes(
            normalizedNameFilter
          )
      );

      // Early return if we found a user
      if (filteredUsers.length > 0) {
        return makeMCPToolJSONSuccess({
          message: `The workspace has ${filteredUsers.length} users containing "${nameFilter}"`,
          result: filteredUsers,
        });
      }
    }
  } while (cursor);

  if (nameFilter) {
    return makeMCPToolJSONSuccess({
      message: `The workspace has ${users.length} users but none containing "${nameFilter}"`,
      result: users,
    });
  }

  return makeMCPToolJSONSuccess({
    message: `The workspace has ${users.length} users`,
    result: users,
  });
}

export async function executeGetUser(userId: string, accessToken: string) {
  const slackClient = await getSlackClient(accessToken);
  const response = await slackClient.users.info({ user: userId });

  if (!response.ok || !response.user) {
    throw new Error(response.error ?? "Unknown error");
  }

  return makeMCPToolJSONSuccess({
    message: `Retrieved user information for ${userId}`,
    result: response.user,
  });
}

export async function executeListPublicChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getCachedPublicChannels({
    mcpServerId,
    slackClient,
  });

  if (nameFilter) {
    const normalizedNameFilter = removeDiacritics(nameFilter.toLowerCase());
    const filteredChannels = channels.filter(
      (channel) =>
        removeDiacritics(channel.name?.toLowerCase() ?? "").includes(
          normalizedNameFilter
        ) ||
        removeDiacritics(channel.topic?.value?.toLowerCase() ?? "").includes(
          normalizedNameFilter
        )
    );

    // Early return if we found a channel
    if (filteredChannels.length > 0) {
      return makeMCPToolJSONSuccess({
        message: `The workspace has ${filteredChannels.length} channels containing "${nameFilter}"`,
        result: filteredChannels,
      });
    }
  }
  if (nameFilter) {
    return makeMCPToolJSONSuccess({
      message: `The workspace has ${channels.length} channels but none containing "${nameFilter}"`,
      result: channels,
    });
  }

  return makeMCPToolJSONSuccess({
    message: `The workspace has ${channels.length} channels`,
    result: channels,
  });
}

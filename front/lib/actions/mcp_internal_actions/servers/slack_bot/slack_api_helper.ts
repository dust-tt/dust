import { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import type { Member } from "@slack/web-api/dist/response/UsersListResponse";
import slackifyMarkdown from "slackify-markdown";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { removeDiacritics } from "@app/lib/utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { getAgentRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";

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

export const getCachedPublicChannels = cacheWithRedis(
  _getPublicChannels,
  ({ mcpServerId }: GetPublicChannelsArgs) => mcpServerId,
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);

// Post message function
export async function executePostMessage(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType,
  {
    accessToken,
    to,
    message,
    threadTs,
    fileId,
  }: {
    accessToken: string;
    to: string;
    message: string;
    threadTs: string | undefined;
    fileId: string | undefined;
  }
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

  // If a file is provided, upload it as attachment of the original message
  if (fileId) {
    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return new Err(
        new MCPError("File not found", {
          tracked: false,
        })
      );
    }

    // Resolve channel id
    const conversationsList = await slackClient.conversations.list({
      exclude_archived: true,
    });
    if (!conversationsList.ok) {
      return new Err(
        new MCPError(conversationsList.error ?? "Failed to list conversations")
      );
    }
    const searchString = to.trim().replace(/^#/, "").toLowerCase();
    const channel = conversationsList.channels?.find(
      (c) =>
        c.name?.toLowerCase() === searchString ||
        c.id?.toLowerCase() === searchString
    );
    if (!channel) {
      return new Err(
        new MCPError(
          `Unable to resolve channel id for "${to}". Please use a channel id or a valid channel name.`,
          {
            tracked: false,
          }
        )
      );
    }
    const channelId = channel.id;

    const signedUrl = await file.getSignedUrlForDownload(auth, "original");
    const fileResp = await fetch(signedUrl);
    if (!fileResp.ok) {
      return new Err(
        new MCPError(`Failed to fetch file (HTTP ${fileResp.status})`)
      );
    }
    const arrayBuf = await fileResp.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuf);

    const filename = file.fileName ?? `upload_${file.sId}`;

    const uploadResp = await slackClient.filesUploadV2({
      channel_id: channelId,
      file: fileBuffer,
      filename,
      filetype: file.contentType,
      initial_comment: message,
      thread_ts: threadTs,
    });

    if (!uploadResp.ok) {
      return new Err(new MCPError(uploadResp.error ?? "Unknown error"));
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Message with file uploaded to ${channelId}`,
      },
      { type: "text" as const, text: JSON.stringify(uploadResp, null, 2) },
    ]);
  }

  // No file provided: regular message
  const response = await slackClient.chat.postMessage({
    channel: to,
    text: message,
    mrkdwn: true,
    thread_ts: threadTs,
  });

  if (!response.ok) {
    return new Err(new MCPError(response.error ?? "Unknown error"));
  }

  return new Ok([
    { type: "text" as const, text: `Message posted to ${to}` },
    { type: "text" as const, text: JSON.stringify(response, null, 2) },
  ]);
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
      return new Err(new MCPError(response.error ?? "Unknown error"));
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
        return new Ok([
          {
            type: "text" as const,
            text: `The workspace has ${filteredUsers.length} users containing "${nameFilter}"`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(filteredUsers, null, 2),
          },
        ]);
      }
    }
  } while (cursor);

  if (nameFilter) {
    return new Ok([
      {
        type: "text" as const,
        text: `The workspace has ${users.length} users but none containing "${nameFilter}"`,
      },
      { type: "text" as const, text: JSON.stringify(users, null, 2) },
    ]);
  }

  return new Ok([
    { type: "text" as const, text: `The workspace has ${users.length} users` },
    { type: "text" as const, text: JSON.stringify(users, null, 2) },
  ]);
}

export async function executeGetUser(userId: string, accessToken: string) {
  const slackClient = await getSlackClient(accessToken);
  const response = await slackClient.users.info({ user: userId });

  if (!response.ok || !response.user) {
    return new Err(new MCPError(response.error ?? "Unknown error"));
  }
  return new Ok([
    { type: "text" as const, text: `Retrieved user information for ${userId}` },
    { type: "text" as const, text: JSON.stringify(response.user, null, 2) },
  ]);
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
      return new Ok([
        {
          type: "text" as const,
          text: `The workspace has ${filteredChannels.length} channels containing "${nameFilter}"`,
        },
        {
          type: "text" as const,
          text: JSON.stringify(filteredChannels, null, 2),
        },
      ]);
    }
  }
  if (nameFilter) {
    return new Ok([
      {
        type: "text" as const,
        text: `The workspace has ${channels.length} channels but none containing "${nameFilter}"`,
      },
      { type: "text" as const, text: JSON.stringify(channels, null, 2) },
    ]);
  }

  return new Ok([
    {
      type: "text" as const,
      text: `The workspace has ${channels.length} channels`,
    },
    { type: "text" as const, text: JSON.stringify(channels, null, 2) },
  ]);
}

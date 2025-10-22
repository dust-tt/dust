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
import { getConversationRoute } from "@app/lib/utils/router";
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

type GetChannelsArgs = {
  mcpServerId: string;
  slackClient: WebClient;
  types?: string;
  memberOnly?: boolean;
};

type ChannelWithIdAndName = Omit<Channel, "id" | "name"> & {
  id: string;
  name: string;
};

const _getChannels = async ({
  slackClient,
  types = "public_channel",
  memberOnly = false,
}: GetChannelsArgs): Promise<ChannelWithIdAndName[]> => {
  const channels: Channel[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.conversations.list({
      cursor,
      limit: 100,
      exclude_archived: true,
      types,
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

  // For regular channels and mpim (multi-party DMs), we filter by id and name.
  // For im (1-on-1 DMs), they don't have a name property, only a user property.
  // So we need to handle both cases.
  let filteredChannels = channels.filter((c) => {
    if (!c.id) {
      return false;
    }
    // For im (1-on-1 DMs), they have user but no name
    if (c.is_im) {
      return !!c.user;
    }
    // For other types (channels, mpim), they must have a name
    return !!c.name;
  });

  // Filter by membership if requested.
  if (memberOnly) {
    filteredChannels = filteredChannels.filter((c) => c.is_member);
  }

  return filteredChannels
    .map((c) => ({
      ...c,
      id: c.id!,
      // For im (1-on-1 DMs), use the user ID as the name since they don't have a name property
      name: c.name ?? (c.is_im ? c.user : undefined)!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getCachedPublicChannels = cacheWithRedis(
  _getChannels,
  ({ mcpServerId }: GetChannelsArgs) => mcpServerId,
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);

export const getCachedChannels = cacheWithRedis(
  _getChannels,
  ({ mcpServerId, types, memberOnly }: GetChannelsArgs) =>
    `${mcpServerId}-${types}-${memberOnly}`,
  {
    ttlMs: 60 * 10 * 1000, // 10 minutes
  }
);

// Cache users list to avoid repeated API calls
const _getUsersList = async (slackClient: WebClient): Promise<Member[]> => {
  const usersResponse = await slackClient.users.list();
  if (!usersResponse.ok || !usersResponse.members) {
    return [];
  }
  return usersResponse.members;
};

export const getCachedUsersList = cacheWithRedis(
  async ({ slackClient }: { mcpServerId: string; slackClient: WebClient }) =>
    _getUsersList(slackClient),
  ({ mcpServerId }: { mcpServerId: string; slackClient: WebClient }) =>
    `users-${mcpServerId}`,
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

  const agentUrl = getConversationRoute(
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

export async function executeListChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getCachedChannels({
    mcpServerId,
    slackClient,
    types: "public_channel,private_channel",
    memberOnly: false,
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

export async function executeListJoinedChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getCachedChannels({
    mcpServerId,
    slackClient,
    types: "public_channel,private_channel",
    memberOnly: true,
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

    if (filteredChannels.length > 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `You are a member of ${filteredChannels.length} channels containing "${nameFilter}"`,
        },
        {
          type: "text" as const,
          text: JSON.stringify(filteredChannels, null, 2),
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: `You are a member of ${channels.length} channels but none containing "${nameFilter}"`,
      },
      { type: "text" as const, text: JSON.stringify(channels, null, 2) },
    ]);
  }

  return new Ok([
    {
      type: "text" as const,
      text: `You are a member of ${channels.length} channels`,
    },
    { type: "text" as const, text: JSON.stringify(channels, null, 2) },
  ]);
}

export async function executeListDMs(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);

  const conversations = await getCachedChannels({
    mcpServerId,
    slackClient,
    types: "im,mpim",
    memberOnly: false,
  });

  // For 1-on-1 DMs (is_im: true), the name is the user ID.
  // Instead of fetching user info one by one (very slow), fetch all users at once
  const userIds = new Set(
    conversations
      .filter((conv) => conv.is_im && conv.name)
      .map((conv) => conv.name!)
  );

  // Fetch all users at once (much faster than individual calls)
  // Use cached version to avoid repeated API calls
  const usersMap = new Map<string, { real_name?: string; name?: string }>();
  if (userIds.size > 0) {
    try {
      const members = await getCachedUsersList({ mcpServerId, slackClient });
      for (const member of members) {
        if (member.id && userIds.has(member.id)) {
          usersMap.set(member.id, {
            real_name: member.real_name,
            name: member.name,
          });
        }
      }
    } catch (e) {
      // Ignore errors, will fall back to user IDs
    }
  }

  // Now map conversations to include user info
  const conversationsWithUserInfo = conversations.map((conv) => {
    if (conv.is_im && conv.name) {
      const userInfo = usersMap.get(conv.name);
      if (userInfo) {
        return {
          ...conv,
          user_real_name: userInfo.real_name,
          user_name: userInfo.name,
          display_name: userInfo.real_name ?? userInfo.name ?? conv.name,
        };
      }
    }
    // For mpim or if user fetch failed, use the existing name
    return {
      ...conv,
      user_real_name: undefined,
      user_name: undefined,
      display_name: conv.name,
    };
  });

  // Format the conversations in a clean, readable way for the agent
  const formattedConversations = conversationsWithUserInfo.map((conv) => {
    const type = conv.is_im
      ? "1-on-1 DM"
      : conv.is_mpim
        ? "Group DM"
        : "Unknown";
    return {
      channel_id: conv.id,
      type,
      display_name: conv.display_name,
      user_id: conv.user ?? null,
      num_members: conv.num_members ?? (conv.is_im ? 2 : null),
    };
  });

  if (nameFilter) {
    const normalizedNameFilter = removeDiacritics(nameFilter.toLowerCase());
    const filteredConversations = formattedConversations.filter((conv) => {
      const displayName = removeDiacritics(
        (conv.display_name ?? "").toLowerCase()
      );
      return displayName.includes(normalizedNameFilter);
    });

    if (filteredConversations.length > 0) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `Found ${filteredConversations.length} direct messages matching "${nameFilter}":\n\n` +
            filteredConversations
              .map(
                (conv) =>
                  `- ${conv.type}: ${conv.display_name} (channel_id: ${conv.channel_id})`
              )
              .join("\n"),
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: `You have ${formattedConversations.length} direct messages but none match "${nameFilter}".`,
      },
    ]);
  }

  // Return all DMs in a readable format
  const oneOnOneDMs = formattedConversations.filter(
    (conv) => conv.type === "1-on-1 DM"
  );
  const groupDMs = formattedConversations.filter(
    (conv) => conv.type === "Group DM"
  );

  return new Ok([
    {
      type: "text" as const,
      text:
        `You have ${formattedConversations.length} direct messages:\n\n` +
        `**1-on-1 DMs (${oneOnOneDMs.length}):**\n` +
        oneOnOneDMs
          .slice(0, 20)
          .map(
            (conv) =>
              `- ${conv.display_name} (channel_id: ${conv.channel_id}, user_id: ${conv.user_id})`
          )
          .join("\n") +
        (oneOnOneDMs.length > 20
          ? `\n... and ${oneOnOneDMs.length - 20} more`
          : "") +
        `\n\n**Group DMs (${groupDMs.length}):**\n` +
        (groupDMs.length > 0
          ? groupDMs
              .map(
                (conv) =>
                  `- ${conv.display_name} (channel_id: ${conv.channel_id}, ${conv.num_members} members)`
              )
              .join("\n")
          : "None"),
    },
  ]);
}

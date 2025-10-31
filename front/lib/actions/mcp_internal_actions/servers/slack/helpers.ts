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

// Constants for Slack API limits and pagination.
export const SLACK_API_PAGE_SIZE = 100;
export const MAX_CHANNELS_LIMIT = 500;
export const MAX_THREAD_MESSAGES = 200;
export const DEFAULT_THREAD_MESSAGES = 20;
export const CHANNEL_CACHE_TTL_MS = 60 * 10 * 1000; // 10 minutes

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

// Minimal channel information returned to reduce context window usage.
export type MinimalChannelInfo = {
  id: string;
  name: string;
  created: number;
  creator: string;
  is_channel: boolean;
  is_private: boolean;
  is_member: boolean;
  previous_names: string[];
  num_members?: number;
  topic?: string;
};

// Clean channel payload to keep only essential fields.
export function cleanChannelPayload(channel: Channel): MinimalChannelInfo {
  return {
    id: channel.id ?? "",
    name: channel.name ?? "",
    created: channel.created ?? 0,
    creator: channel.creator ?? "",
    is_channel: channel.is_channel ?? false,
    is_private: channel.is_private ?? false,
    is_member: channel.is_member ?? false,
    previous_names: channel.previous_names ?? [],
    num_members: channel.num_members,
    topic: channel.topic?.value,
  };
}

export const getPublicChannels = async ({
  slackClient,
}: GetPublicChannelsArgs): Promise<ChannelWithIdAndName[]> => {
  const channels: Channel[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.conversations.list({
      cursor,
      limit: SLACK_API_PAGE_SIZE,
      exclude_archived: true,
      types: "public_channel",
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    channels.push(...(response.channels ?? []));
    cursor = response.response_metadata?.next_cursor;

    // We can't handle a huge list of channels, and even if we could, it would be unusable.
    // in the UI. So we arbitrarily cap it to MAX_CHANNELS_LIMIT channels.
    if (channels.length >= MAX_CHANNELS_LIMIT) {
      logger.warn(
        `Channel list truncated after reaching over ${MAX_CHANNELS_LIMIT} channels.`
      );
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

export const getChannels = async ({
  slackClient,
  types = "public_channel",
  memberOnly = false,
}: GetChannelsArgs): Promise<ChannelWithIdAndName[]> => {
  const channels: Channel[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.conversations.list({
      cursor,
      limit: SLACK_API_PAGE_SIZE,
      exclude_archived: true,
      types,
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    channels.push(...(response.channels ?? []));
    cursor = response.response_metadata?.next_cursor;

    // We can't handle a huge list of channels, and even if we could, it would be unusable.
    // in the UI. So we arbitrarily cap it to MAX_CHANNELS_LIMIT channels.
    if (channels.length >= MAX_CHANNELS_LIMIT) {
      logger.warn(
        `Channel list truncated after reaching over ${MAX_CHANNELS_LIMIT} channels.`
      );
      break;
    }
  } while (cursor);

  let filteredChannels = channels.filter((c) => !!c.id && !!c.name);

  // Filter by membership if requested.
  if (memberOnly) {
    filteredChannels = filteredChannels.filter((c) => c.is_member);
  }

  return filteredChannels
    .map((c) => ({
      ...c,
      id: c.id!,
      name: c.name!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getCachedPublicChannels = cacheWithRedis(
  getPublicChannels,
  ({ mcpServerId }: GetPublicChannelsArgs) => mcpServerId,
  {
    ttlMs: CHANNEL_CACHE_TTL_MS,
  }
);

// Helper function to build filtered list responses.
function buildFilteredListResponse<T, U = T>(
  items: T[],
  nameFilter: string | undefined,
  filterFn: (item: T, normalizedFilter: string) => boolean,
  contextMessage: (
    count: number,
    hasFilter: boolean,
    filterText?: string
  ) => string,
  transformFn?: (item: T) => U
): Ok<Array<{ type: "text"; text: string }>> {
  const transform = transformFn ?? ((item: T) => item as unknown as U);

  if (!nameFilter) {
    return new Ok([
      { type: "text" as const, text: contextMessage(items.length, false) },
      {
        type: "text" as const,
        text: JSON.stringify(items.map(transform), null, 2),
      },
    ]);
  }

  const normalizedNameFilter = removeDiacritics(nameFilter.toLowerCase());
  const filteredItems = items.filter((item) =>
    filterFn(item, normalizedNameFilter)
  );

  if (filteredItems.length > 0) {
    return new Ok([
      {
        type: "text" as const,
        text: contextMessage(filteredItems.length, true, nameFilter),
      },
      {
        type: "text" as const,
        text: JSON.stringify(filteredItems.map(transform), null, 2),
      },
    ]);
  }

  return new Ok([
    {
      type: "text" as const,
      text:
        contextMessage(items.length, true, nameFilter) + " but none matching",
    },
    {
      type: "text" as const,
      text: JSON.stringify(items.map(transform), null, 2),
    },
  ]);
}

// Post message function.
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
  },
  mcpServerId: string
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

  // If a file is provided, upload it as attachment of the original message.
  fileId = undefined; // TODO(2025-10-22 chris): remove this once Slack enables file:write scope
  if (fileId) {
    const file = await FileResource.fetchById(auth, fileId);
    if (!file) {
      return new Err(
        new MCPError("File not found", {
          tracked: false,
        })
      );
    }

    // Resolve channel id - optimize by trying conversations.info first if it looks like an ID.
    const searchString = to.trim().replace(/^#/, "");
    let channelId: string | undefined;

    // If searchString looks like a Slack channel ID (starts with C or G), try direct lookup first.
    if (searchString.match(/^[CG][A-Z0-9]+$/)) {
      try {
        const infoResp = await slackClient.conversations.info({
          channel: searchString,
        });
        if (infoResp.ok && infoResp.channel?.id) {
          channelId = infoResp.channel.id;
        }
      } catch (error) {
        // Fall through to list-based search.
      }
    }

    // If not found via direct lookup, search through cached channels list.
    if (!channelId) {
      const conversationsList = await getCachedPublicChannels({
        mcpServerId,
        slackClient,
      });
      const channel = conversationsList.find(
        (c) =>
          c.name?.toLowerCase() === searchString.toLowerCase() ||
          c.id?.toLowerCase() === searchString.toLowerCase()
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
      channelId = channel.id;
    }

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

  // No file provided: regular message.
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

export async function executeScheduleMessage(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType,
  {
    accessToken,
    to,
    message,
    post_at,
    threadTs,
  }: {
    accessToken: string;
    to: string;
    message: string;
    post_at: number | string;
    threadTs: string | undefined;
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

  // Convert post_at to Unix timestamp in seconds.
  let timestampSeconds: number;
  if (typeof post_at === "string") {
    // Parse ISO date string.
    const parsedDate = new Date(post_at);
    if (isNaN(parsedDate.getTime())) {
      return new Err(
        new MCPError(
          `Invalid date format: "${post_at}". Please provide a valid ISO 8601 datetime string (e.g., "2025-10-31T14:55:00Z") or Unix timestamp in seconds.`
        )
      );
    }
    timestampSeconds = Math.floor(parsedDate.getTime() / 1000);
  } else {
    timestampSeconds = post_at;
  }

  // Validate that post_at is in the future.
  const now = Math.floor(Date.now() / 1000);
  if (timestampSeconds <= now) {
    const providedDate = new Date(timestampSeconds * 1000).toISOString();
    const currentDate = new Date(now * 1000).toISOString();
    return new Err(
      new MCPError(
        `The scheduled time must be in the future. Provided: ${providedDate}, Current time: ${currentDate}`
      )
    );
  }

  // Validate that post_at is within 120 days.
  const maxFutureTime = now + 120 * 24 * 60 * 60; // 120 days in seconds
  if (timestampSeconds > maxFutureTime) {
    const maxDate = new Date(maxFutureTime * 1000).toISOString();
    return new Err(
      new MCPError(
        `The scheduled time cannot be more than 120 days in the future. Maximum allowed time: ${maxDate}`
      )
    );
  }

  const response = await slackClient.chat.scheduleMessage({
    channel: to,
    text: message,
    post_at: timestampSeconds.toString(),
    thread_ts: threadTs,
  });

  if (!response.ok) {
    return new Err(new MCPError(response.error ?? "Unknown error"));
  }

  const scheduledDate = new Date(timestampSeconds * 1000);

  // Format in local timezone (server timezone, likely matches user's for EU).
  const localDate = scheduledDate.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  return new Ok([
    {
      type: "text" as const,
      text: `Message scheduled successfully to ${to} at ${localDate} (server time)`,
    },
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
      limit: SLACK_API_PAGE_SIZE,
    });
    if (!response.ok) {
      return new Err(new MCPError(response.error ?? "Unknown error"));
    }
    users.push(...(response.members ?? []).filter((member) => !member.is_bot));
    cursor = response.response_metadata?.next_cursor;

    // Early return optimization: if we found matching users and have a filter, return immediately.
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

      if (filteredUsers.length > 0) {
        return buildFilteredListResponse<Member>(
          users,
          nameFilter,
          (user, normalizedFilter) =>
            removeDiacritics(user.name?.toLowerCase() ?? "").includes(
              normalizedFilter
            ) ||
            removeDiacritics(user.real_name?.toLowerCase() ?? "").includes(
              normalizedFilter
            ),
          (count, hasFilter, filterText) =>
            hasFilter
              ? `The workspace has ${count} users containing "${filterText}"`
              : `The workspace has ${count} users`
        );
      }
    }
  } while (cursor);

  // No filter or no matches found after checking all pages.
  return buildFilteredListResponse<Member>(
    users,
    nameFilter,
    (user, normalizedFilter) =>
      removeDiacritics(user.name?.toLowerCase() ?? "").includes(
        normalizedFilter
      ) ||
      removeDiacritics(user.real_name?.toLowerCase() ?? "").includes(
        normalizedFilter
      ),
    (count, hasFilter, filterText) =>
      hasFilter
        ? `The workspace has ${count} users containing "${filterText}"`
        : `The workspace has ${count} users`
  );
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

    // Early return if we found a channel.
    if (filteredChannels.length > 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `The workspace has ${filteredChannels.length} channels containing "${nameFilter}"`,
        },
        {
          type: "text" as const,
          text: JSON.stringify(
            filteredChannels.map(cleanChannelPayload),
            null,
            2
          ),
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
      {
        type: "text" as const,
        text: JSON.stringify(channels.map(cleanChannelPayload), null, 2),
      },
    ]);
  }

  return new Ok([
    {
      type: "text" as const,
      text: `The workspace has ${channels.length} channels`,
    },
    {
      type: "text" as const,
      text: JSON.stringify(channels.map(cleanChannelPayload), null, 2),
    },
  ]);
}

export async function executeListChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getChannels({
    mcpServerId,
    slackClient,
    types: "public_channel,private_channel",
    memberOnly: false,
  });

  return buildFilteredListResponse<ChannelWithIdAndName, MinimalChannelInfo>(
    channels,
    nameFilter,
    (channel, normalizedFilter) =>
      removeDiacritics(channel.name?.toLowerCase() ?? "").includes(
        normalizedFilter
      ) ||
      removeDiacritics(channel.topic?.value?.toLowerCase() ?? "").includes(
        normalizedFilter
      ),
    (count, hasFilter, filterText) =>
      hasFilter
        ? `The workspace has ${count} channels containing "${filterText}"`
        : `The workspace has ${count} channels`,
    cleanChannelPayload
  );
}

export async function executeListJoinedChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getChannels({
    mcpServerId,
    slackClient,
    types: "public_channel,private_channel",
    memberOnly: true,
  });

  return buildFilteredListResponse<ChannelWithIdAndName, MinimalChannelInfo>(
    channels,
    nameFilter,
    (channel, normalizedFilter) =>
      removeDiacritics(channel.name?.toLowerCase() ?? "").includes(
        normalizedFilter
      ) ||
      removeDiacritics(channel.topic?.value?.toLowerCase() ?? "").includes(
        normalizedFilter
      ),
    (count, hasFilter, filterText) =>
      hasFilter
        ? `You are a member of ${count} channels containing "${filterText}"`
        : `You are a member of ${count} channels`,
    cleanChannelPayload
  );
}

export async function executeReadThreadMessages(
  channel: string,
  threadTs: string,
  limit: number | undefined,
  cursor: string | undefined,
  oldest: string | undefined,
  latest: string | undefined,
  accessToken: string
) {
  const slackClient = await getSlackClient(accessToken);

  try {
    const response = await slackClient.conversations.replies({
      channel: channel,
      ts: threadTs,
      limit: limit
        ? Math.min(limit, MAX_THREAD_MESSAGES)
        : DEFAULT_THREAD_MESSAGES,
      cursor: cursor,
      oldest: oldest,
      latest: latest,
    });

    if (!response.ok) {
      return new Err(
        new MCPError(
          response.error === "channel_not_found"
            ? "Channel not found or you are not a member of this channel"
            : response.error === "thread_not_found"
              ? "Thread not found or has been deleted"
              : response.error ?? "Unknown error reading thread"
        )
      );
    }

    const messages = response.messages ?? [];
    if (messages.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No messages found in this thread.",
        },
      ]);
    }

    // First message is the parent, rest are replies.
    const parentMessage = messages[0];
    const threadReplies = messages.slice(1);

    const formattedOutput = {
      parent_message: {
        text: parentMessage?.text ?? "",
        user: parentMessage?.user ?? "",
        ts: parentMessage?.ts ?? "",
        reply_count: parentMessage?.reply_count ?? 0,
      },
      thread_replies: threadReplies.map((msg) => ({
        text: msg.text ?? "",
        user: msg.user ?? "",
        ts: msg.ts ?? "",
      })),
      total_messages: messages.length,
      has_more: response.has_more ?? false,
      next_cursor: response.response_metadata?.next_cursor ?? null,
      pagination_info: {
        current_page_size: messages.length,
        replies_in_this_page: threadReplies.length,
      },
    };

    return new Ok([
      {
        type: "text" as const,
        text: `Thread contains ${formattedOutput.total_messages} message(s) (1 parent + ${formattedOutput.thread_replies.length} replies)`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(formattedOutput, null, 2),
      },
    ]);
  } catch (error) {
    return new Err(new MCPError(`Error reading thread messages: ${error}`));
  }
}

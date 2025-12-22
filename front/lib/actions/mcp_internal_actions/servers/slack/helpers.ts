import { WebClient } from "@slack/web-api";
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import type { Usergroup } from "@slack/web-api/dist/response/UsergroupsListResponse";
import type { Member } from "@slack/web-api/dist/response/UsersListResponse";
import slackifyMarkdown from "slackify-markdown";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { removeDiacritics } from "@app/lib/utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { Err, normalizeError, Ok } from "@app/types";

// Constants for Slack API limits and pagination.
export const SLACK_API_PAGE_SIZE = 100;
export const MAX_CHANNELS_LIMIT = 500;
export const MAX_THREAD_MESSAGES = 200;
export const DEFAULT_THREAD_MESSAGES = 20;
export const SLACK_THREAD_LISTING_LIMIT = 100;
export const CHANNEL_CACHE_TTL_MS = 60 * 10 * 1000; // 10 minutes

export function isSlackMissingScope(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("missing_scope")
  );
}

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
  slackClient: WebClient;
  scope: "public" | "joined";
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

// Minimal user information returned to reduce context window usage.
export type MinimalUserInfo = {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  email?: string;
};

// Clean user payload to keep only essential fields.
export function cleanUserPayload(user: Member): MinimalUserInfo {
  return {
    id: user.id ?? "",
    name: user.name ?? "",
    real_name: user.real_name ?? "",
    display_name: user.profile?.display_name ?? "",
    email: user.profile?.email,
  };
}

// Minimal user group information returned to reduce context window usage.
export type MinimalUserGroupInfo = {
  id: string;
  handle: string;
  name: string;
  description?: string;
  user_count?: number;
};

// Clean user group payload to keep only essential fields.
export function cleanUserGroupPayload(
  usergroup: Usergroup
): MinimalUserGroupInfo {
  return {
    id: usergroup.id ?? "",
    handle: usergroup.handle ?? "",
    name: usergroup.name ?? "",
    description: usergroup.description,
    user_count: usergroup.user_count,
  };
}

export const getChannels = async ({
  slackClient,
  scope,
}: GetChannelsArgs): Promise<ChannelWithIdAndName[]> => {
  const channels: Channel[] = [];
  let cursor: string | undefined = undefined;

  do {
    // Choose the right endpoint based on scope
    const response: {
      ok?: boolean;
      channels?: Channel[];
      response_metadata?: { next_cursor?: string };
    } =
      scope === "joined"
        ? await slackClient.users.conversations({
            cursor,
            limit: SLACK_API_PAGE_SIZE,
            exclude_archived: true,
            types: "public_channel,private_channel,im,mpim",
          })
        : await slackClient.conversations.list({
            cursor,
            limit: SLACK_API_PAGE_SIZE,
            exclude_archived: true,
            types: "public_channel",
          });

    if (!response.ok) {
      throw new Error(`Failed to list ${scope} channels`);
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

export const getCachedPublicChannels = cacheWithRedis(
  async ({
    slackClient,
  }: {
    slackClient: WebClient;
    mcpServerId: string;
  }): Promise<ChannelWithIdAndName[]> => {
    return getChannels({ slackClient, scope: "public" });
  },
  ({ mcpServerId }: { mcpServerId: string }) => mcpServerId,
  {
    ttlMs: CHANNEL_CACHE_TTL_MS,
  }
);

// Helper function to resolve channel name or ID to channel ID.
// Supports public channels, private channels, and DMs.
export async function resolveChannelId({
  channelNameOrId,
  accessToken,
}: {
  channelNameOrId: string;
  accessToken: string;
}): Promise<string | null> {
  const slackClient = await getSlackClient(accessToken);
  const searchString = channelNameOrId
    .trim()
    .replace(/^#/, "")
    .replace(/^@/, "");

  // If searchString looks like a Slack channel/DM ID (starts with C, G, or D), try direct lookup first.
  if (searchString.match(/^[CGD][A-Z0-9]+$/)) {
    try {
      const infoResp = await slackClient.conversations.info({
        channel: searchString,
      });
      if (infoResp.ok && infoResp.channel?.id) {
        return infoResp.channel.id;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Fall through to name-based search.
    }
  }

  // Search by name in all joined channels (public, private, DMs).
  const channels = await getChannels({
    slackClient,
    scope: "joined",
  });

  const channel = channels.find(
    (c) =>
      c.name?.toLowerCase() === searchString.toLowerCase() ||
      c.id?.toLowerCase() === searchString.toLowerCase()
  );

  return channel?.id ?? null;
}

// Helper function to resolve user ID to display name.
// Returns the user's display name or real name, or null if not found.
export async function resolveUserDisplayName({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}): Promise<string | null> {
  const slackClient = await getSlackClient(accessToken);

  try {
    const response = await slackClient.users.info({ user: userId });
    if (response.ok && response.user) {
      // Prefer display_name, fallback to real_name, then to name.
      return (
        response.user.profile?.display_name ??
        response.user.real_name ??
        response.user.name ??
        null
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Return null if we can't resolve the user.
  }

  return null;
}

// Resolves a channel ID to a human-readable display name.
// Handles DMs (direct messages) and regular channels.
// This function expects a normalized channel ID from resolveChannelId.
export async function resolveChannelDisplayName({
  channelId,
  accessToken,
}: {
  channelId: string;
  accessToken: string;
}): Promise<string> {
  const slackClient = await getSlackClient(accessToken);

  try {
    const channelInfo = await slackClient.conversations.info({
      channel: channelId,
    });

    if (channelInfo.ok && channelInfo.channel) {
      // For DMs, channelId starts with "D" and channel.name contains the user ID.
      if (channelId.startsWith("D") && channelInfo.channel.name) {
        const userName = await resolveUserDisplayName({
          userId: channelInfo.channel.name,
          accessToken,
        });
        return userName ? `@${userName}` : `@${channelInfo.channel.name}`;
      }

      // For regular channels (public/private).
      if (channelInfo.channel.name) {
        return `#${channelInfo.channel.name}`;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // On error, return a fallback value.
    // If it looks like a DM, prefix with @, otherwise with #.
    if (channelId.startsWith("D")) {
      return `@${channelId}`;
    }
  }

  return `#${channelId}`;
}

// Format users as Markdown.
function formatUsersAsMarkdown(users: MinimalUserInfo[]): string {
  return users
    .map(
      (user) =>
        `- **ID: ${user.id}**` +
        `\n  - Name: ${user.name}` +
        `\n  - Real name: ${user.real_name}` +
        `\n  - Display name: ${user.display_name}` +
        (user.email ? `\n  - Email: ${user.email}` : "")
    )
    .join("\n");
}

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
  transformFn?: (item: T) => U,
  formatFn?: (items: U[]) => string
): Ok<Array<{ type: "text"; text: string }>> {
  const transform = transformFn ?? ((item: T) => item as unknown as U);

  if (!nameFilter) {
    const transformedItems = items.map(transform);
    const formattedText = formatFn
      ? formatFn(transformedItems)
      : JSON.stringify(transformedItems, null, 2);
    return new Ok([
      { type: "text" as const, text: contextMessage(items.length, false) },
      {
        type: "text" as const,
        text: formattedText,
      },
    ]);
  }

  const normalizedNameFilter = removeDiacritics(nameFilter.toLowerCase());
  const filteredItems = items.filter((item) =>
    filterFn(item, normalizedNameFilter)
  );

  if (filteredItems.length > 0) {
    const transformedItems = filteredItems.map(transform);
    const formattedText = formatFn
      ? formatFn(transformedItems)
      : JSON.stringify(transformedItems, null, 2);
    return new Ok([
      {
        type: "text" as const,
        text: contextMessage(filteredItems.length, true, nameFilter),
      },
      {
        type: "text" as const,
        text: formattedText,
      },
    ]);
  }

  const transformedItems = items.map(transform);
  const formattedText = formatFn
    ? formatFn(transformedItems)
    : JSON.stringify(transformedItems, null, 2);
  return new Ok([
    {
      type: "text" as const,
      text:
        contextMessage(items.length, true, nameFilter) + " but none matching",
    },
    {
      type: "text" as const,
      text: formattedText,
    },
  ]);
}

export async function hasSlackScope(
  accessToken: string,
  scope: string
): Promise<boolean> {
  const slackClient = await getSlackClient(accessToken);
  const authResult = await slackClient.auth.test();
  return (
    authResult.ok && !!authResult.response_metadata?.scopes?.includes(scope)
  );
}

export async function executeListPublicChannels(
  nameFilter: string | undefined,
  accessToken: string,
  mcpServerId: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getCachedPublicChannels({
    slackClient,
    mcpServerId,
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
  accessToken: string
) {
  const slackClient = await getSlackClient(accessToken);
  const channels = await getChannels({
    slackClient,
    scope: "joined",
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

// Helper function to filter channels by substring matching on name, topic, and purpose.
function filterChannels(
  channels: ChannelWithIdAndName[],
  query: string,
  limit: number = 10
): ChannelWithIdAndName[] {
  if (!query || query.trim() === "") {
    return channels
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  const queryLower = query.toLowerCase();

  const matched = channels.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(queryLower);
    const topicMatch = c.topic?.value?.toLowerCase().includes(queryLower);
    const purposeMatch = c.purpose?.value?.toLowerCase().includes(queryLower);
    return nameMatch || topicMatch || purposeMatch;
  });

  return matched.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

// Execute search_channels: "exact" uses conversations.info, "search" fetches lists and filters locally.
export async function executeSearchChannels(
  query: string,
  scope: "joined" | "all",
  lookupType: "exact" | "search",
  {
    accessToken,
  }: {
    accessToken: string;
  }
): Promise<Ok<Array<{ type: "text"; text: string }>> | Err<MCPError>> {
  const slackClient = await getSlackClient(accessToken);

  // Exact lookup: direct API call to conversations.info
  if (lookupType === "exact") {
    try {
      const response = await slackClient.conversations.info({
        channel: query.replace(/^[#@]/, ""),
      });

      if (response.ok && response.channel) {
        return new Ok([
          {
            type: "text" as const,
            text: JSON.stringify(response.channel, null, 2),
          },
        ]);
      }
    } catch (error) {
      return new Err(
        new MCPError(`Channel not found: ${query}. Error: ${error}`)
      );
    }

    return new Err(new MCPError(`Channel not found: ${query}`));
  }

  // Text search: fetch lists and filter locally
  // scope="joined": search joined first, fallback to all public if no results
  if (scope === "joined") {
    try {
      const joinedChannels = await getChannels({
        slackClient,
        scope: "joined",
      });

      const matchedInJoined = filterChannels(joinedChannels, query, 10);

      if (matchedInJoined.length > 0) {
        return new Ok([
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                channels: matchedInJoined.map(cleanChannelPayload),
                count: matchedInJoined.length,
              },
              null,
              2
            ),
          },
        ]);
      }

      // Fallback to all public
      const allChannels = await getChannels({
        slackClient,
        scope: "public",
      });

      const matchedInAll = filterChannels(allChannels, query, 10);

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              channels: matchedInAll.map(cleanChannelPayload),
              count: matchedInAll.length,
            },
            null,
            2
          ),
        },
      ]);
    } catch (error) {
      return new Err(new MCPError(`Error searching channels: ${error}`));
    }
  }

  // scope="all": search all public channels directly
  try {
    const allChannels = await getChannels({
      slackClient,
      scope: "public",
    });

    const matched = filterChannels(allChannels, query, 10);

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            channels: matched.map(cleanChannelPayload),
            count: matched.length,
          },
          null,
          2
        ),
      },
    ]);
  } catch (error) {
    return new Err(new MCPError(`Error searching channels: ${error}`));
  }
}

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

  if (!(await hasSlackScope(accessToken, "files:write"))) {
    fileId = undefined;
  }

  // If a file is provided, upload it as attachment of the original message.
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // eslint-disable-next-line no-restricted-globals
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
    return new Err(new MCPError("Failed to post message"));
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
    return new Err(new MCPError("Failed to schedule message"));
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

export async function executeListUserGroups({
  accessToken,
}: {
  accessToken: string;
}) {
  const slackClient = await getSlackClient(accessToken);

  try {
    const response = await slackClient.usergroups.list({
      include_count: true,
      include_disabled: false,
      include_users: false,
    });

    if (!response.ok) {
      return new Err(new MCPError("Failed to list user groups"));
    }

    const usergroups = response.usergroups ?? [];
    const cleanedUserGroups = usergroups.map(cleanUserGroupPayload);

    const formattedUserGroups = cleanedUserGroups
      .map(
        (group) =>
          `- **@${group.handle}**` +
          `\n  - Name: ${group.name}` +
          `\n  - ID: \`${group.id}\``
      )
      .join("\n");

    return new Ok([
      {
        type: "text" as const,
        text: `The workspace has ${cleanedUserGroups.length} user groups:\n\n${formattedUserGroups}`,
      },
    ]);
  } catch (error) {
    return new Err(
      new MCPError(
        `Error listing user groups: ${normalizeError(error).message}`
      )
    );
  }
}

export async function executeListUsers({
  nameFilter,
  accessToken,
  includeUserGroups,
}: {
  nameFilter?: string;
  accessToken: string;
  includeUserGroups?: boolean;
}) {
  const slackClient = await getSlackClient(accessToken);

  // Load user groups first if requested.
  let userGroupsContent: Array<{ type: "text"; text: string }> = [];
  if (includeUserGroups) {
    const userGroupsResult = await executeListUserGroups({ accessToken });
    if (userGroupsResult.isOk()) {
      userGroupsContent = userGroupsResult.value;
    }
  }

  const users: Member[] = [];

  let cursor: string | undefined = undefined;
  do {
    const response = await slackClient.users.list({
      cursor,
      limit: SLACK_API_PAGE_SIZE,
    });
    if (!response.ok) {
      return new Err(new MCPError("Failed to list users"));
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
        const usersResponse = buildFilteredListResponse<
          Member,
          MinimalUserInfo
        >(
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
              ? `The workspace has ${count} users containing "${filterText}":\n\n`
              : `The workspace has ${count} users:\n\n`,
          cleanUserPayload,
          formatUsersAsMarkdown
        );

        return new Ok([...userGroupsContent, ...usersResponse.value]);
      }
    }
  } while (cursor);

  // No filter or no matches found after checking all pages.
  const usersResponse = buildFilteredListResponse<Member, MinimalUserInfo>(
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
        ? `The workspace has ${count} users containing "${filterText}":\n\n`
        : `The workspace has ${count} users:\n\n`,
    cleanUserPayload,
    formatUsersAsMarkdown
  );

  return new Ok([...userGroupsContent, ...usersResponse.value]);
}

export async function executeGetUser({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) {
  const slackClient = await getSlackClient(accessToken);
  const response = await slackClient.users.info({ user: userId });

  if (!response.ok || !response.user) {
    return new Err(new MCPError("Failed to get user information"));
  }
  return new Ok([
    { type: "text" as const, text: `Retrieved user information for ${userId}` },
    { type: "text" as const, text: JSON.stringify(response.user, null, 2) },
  ]);
}

export async function executeReadThreadMessages({
  channel,
  threadTs,
  limit,
  cursor,
  oldest,
  latest,
  accessToken,
}: {
  channel: string;
  threadTs: string;
  limit: number | undefined;
  cursor: string | undefined;
  oldest: string | undefined;
  latest: string | undefined;
  accessToken: string;
}) {
  const slackClient = await getSlackClient(accessToken);

  // Resolve channel name/ID to channel ID (supports public/private channels and DMs).
  const channelId = await resolveChannelId({
    channelNameOrId: channel,
    accessToken,
  });
  if (!channelId) {
    return new Err(
      new MCPError(
        `Unable to resolve channel id for "${channel}". Please use a valid channel name, channel id, or user id.`
      )
    );
  }

  // Narrow try-catch to only the Slack API call.
  let response;
  try {
    response = await slackClient.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: limit
        ? Math.min(limit, MAX_THREAD_MESSAGES)
        : DEFAULT_THREAD_MESSAGES,
      cursor: cursor,
      oldest: oldest,
      latest: latest,
    });
  } catch (error) {
    return new Err(new MCPError(`Error reading thread messages: ${error}`));
  }

  if (!response.ok) {
    // Trigger authentication flow for missing_scope.
    if (response.error === "missing_scope") {
      return new Ok(makePersonalAuthenticationError("slack").content);
    }
    return new Err(new MCPError("Failed to read thread messages"));
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
}

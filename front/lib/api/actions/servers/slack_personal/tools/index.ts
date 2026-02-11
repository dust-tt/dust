// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import uniqBy from "lodash/uniqBy";

import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  executeGetUser,
  executeListUsers,
  executePostMessage,
  executeReadThreadMessages,
  executeScheduleMessage,
  executeSearchChannels,
  getSlackClient,
  isSlackMissingScope,
  resolveChannelDisplayName,
  resolveChannelId,
  resolveUserDisplayName,
  SLACK_THREAD_LISTING_LIMIT,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/helpers";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SLACK_SEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import { SLACK_PERSONAL_TOOLS_METADATA } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { stripNullBytes } from "@app/types/shared/utils/string_utils";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import {
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types/shared/utils/time_frame";

const localLogger = logger.child({ module: "mcp_slack_personal" });

export type SlackSearchMatch = {
  author_id?: string;
  author_name?: string;
  channel_id?: string;
  channel_name?: string;
  message_ts?: string;
  content?: string;
  permalink?: string;
};

type SlackSearchResponse = {
  ok: boolean;
  error?: string;
  results: {
    messages: Array<{
      author_id?: string;
      author_user_id?: string;
      author_name?: string;
      channel_id?: string;
      channel_name?: string;
      message_ts?: string;
      content?: string;
      permalink?: string;
    }>;
  };
};

// 'disconnected' is expected when we don't have a Slack connection yet.
export type SlackAIStatus = "enabled" | "disabled" | "disconnected";

export async function getSlackAIEnablementStatus({
  accessToken,
}: {
  accessToken: string;
}): Promise<SlackAIStatus> {
  try {
    // Use assistant.search.info to detect if Slack AI is enabled at workspace level.
    // This endpoint requires search:read.public scope and returns is_ai_search_enabled boolean.
    // eslint-disable-next-line no-restricted-globals
    const assistantSearchInfo = await fetch(
      "https://slack.com/api/assistant.search.info",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!assistantSearchInfo.ok) {
      return "disconnected";
    }

    const data = await assistantSearchInfo.json();

    // Check both HTTP ok and Slack API ok for robustness.
    if (!data.ok) {
      return "disconnected";
    }

    return data.is_ai_search_enabled ? "enabled" : "disabled";
  } catch {
    return "disconnected";
  }
}

export async function getSlackConnectionForMCPServer(
  auth: Authenticator,
  mcpServerId: string
) {
  return getConnectionForMCPServer(auth, {
    mcpServerId,
    connectionType: "workspace", // Always get the admin token.
  });
}

const slackSearch = async (
  query: string,
  accessToken: string
): Promise<SlackSearchMatch[]> => {
  // Try assistant.search.context first (requires special token and Slack AI enabled).
  try {
    const params = new URLSearchParams({
      query,
      sort: "score",
      sort_dir: "desc",
      limit: SLACK_SEARCH_ACTION_NUM_RESULTS.toString(),
      channel_types: "public_channel,private_channel,mpim,im",
    });

    // eslint-disable-next-line no-restricted-globals
    const resp = await fetch(
      `https://slack.com/api/assistant.search.context?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data: SlackSearchResponse =
      (await resp.json()) as SlackSearchResponse;
    if (!data.ok) {
      // If invalid_action_token or other errors, throw to trigger fallback.
      throw new Error(data.error ?? "unknown_error");
    }

    // Transform API response to match SlackSearchMatch format.
    const rawMatches: SlackSearchMatch[] = (data.results.messages ?? []).map(
      (msg) => ({
        author_id: msg.author_id ?? msg.author_user_id,
        author_name: msg.author_name,
        channel_id: msg.channel_id,
        channel_name: msg.channel_name,
        message_ts: msg.message_ts,
        content: msg.content,
        permalink: msg.permalink,
      })
    );

    // Filter out matches that don't have a text.
    const matchesWithText = rawMatches.filter((match) => !!match.content);

    // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
    return matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);
  } catch (error) {
    // Fallback to standard search.messages API if assistant.search.context fails.
    // This typically happens when Slack AI is not enabled (local env) or the token doesn't have the required permissions.
    localLogger.info(
      { error },
      "Failed to use assistant.search.context, falling back to search.messages"
    );

    const slackClient = await getSlackClient(accessToken);

    const response = await slackClient.search.messages({
      query,
      sort: "score",
      sort_dir: "desc",
      count: SLACK_SEARCH_ACTION_NUM_RESULTS,
    });

    if (!response.ok) {
      throw new Error("Failed to search messages");
    }

    const rawMatches = response.messages?.matches ?? [];

    // Transform to match expected format.
    const matches: SlackSearchMatch[] = rawMatches.map((match) => ({
      author_id: match.user,
      author_name: match.username,
      channel_id: match.channel?.id,
      channel_name: match.channel?.name,
      message_ts: match.ts,
      content: match.text,
      permalink: match.permalink,
    }));

    // Filter out matches that don't have text.
    const matchesWithText = matches.filter((match) => !!match.content);

    // Keep only the top results.
    return matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);
  }
};

// Helper function to format a Slack message match for display in the UI.
// Cleans up Slack-specific formatting and returns a human-readable string.
function formatSlackMessageForDisplay(match: SlackSearchMatch): string {
  const author = match.author_name
    ? match.author_id
      ? `${match.author_name} (${match.author_id})`
      : match.author_name
    : (match.author_id ?? "");

  const channel = match.channel_name
    ? match.channel_id
      ? `${match.channel_name} (${match.channel_id})`
      : match.channel_name
    : (match.channel_id ?? "");

  let content = match.content ?? "";

  // assistant.search.context wraps search words in \uE000 and \uE001.
  // which display as squares in the UI, so we strip them out.
  // Ideally, there would be a way to disable this behavior in the Slack API.
  content = content.replace(/[\uE000\uE001]/g, "");

  // Replace mention <@U050CALAKFD|someone> with just @someone in content.
  content = content.replace(
    /<@([A-Z0-9]+)\|([^>]+)>/g,
    (_m, _id, username) => `@${username}`
  );

  return `From ${author} in #${channel}:\n${content}`;
}

// Helper function to format date as YYYY-MM-DD with zero-padding.
function formatDateForSlackQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper function to build search results from matches.
function buildSearchResults<T>(
  matches: T[],
  refs: string[],
  extractors: {
    permalink: (match: T) => string | undefined;
    text: (match: T) => string;
    id: (match: T) => string;
    content: (match: T) => string;
  }
): SearchResultResourceType[] {
  return matches.map(
    (match, index): SearchResultResourceType => ({
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
      uri: extractors.permalink(match) ?? "",
      text: extractors.text(match),
      id: extractors.id(match),
      source: { provider: "slack" },
      tags: [],
      ref: refs[index] ?? "",
      chunks: [stripNullBytes(extractors.content(match))],
    })
  );
}

function buildSlackSearchQuery(
  initial: string,
  {
    timeFrame,
    channels,
    usersFrom,
    usersTo,
    usersMentioned,
  }: {
    timeFrame: TimeFrame | null;
    channels?: string[];
    usersFrom?: string[];
    usersTo?: string[];
    usersMentioned?: string[];
  }
): string {
  let query = initial;
  if (timeFrame) {
    const timestampInMs = timeFrameFromNow(timeFrame);
    const date = new Date(timestampInMs);
    query = `${query} after:${formatDateForSlackQuery(date)}`;
  }
  if (channels && channels.length > 0) {
    query = `${query} ${channels
      .map((channel) =>
        // Because we use channel names and not IDs, we need to use the #CHANNEL format instead of <#CHANNEL_ID>.
        channel.charAt(0) === "#" ? `in:${channel}` : `in:#${channel}`
      )
      .join(" ")}`;
  }
  if (usersFrom && usersFrom.length > 0) {
    query = `${query} ${usersFrom.map((user) => `from:${user}`).join(" ")}`;
  }
  if (usersTo && usersTo.length > 0) {
    query = `${query} ${usersTo.map((user) => `to:${user}`).join(" ")}`;
  }
  if (usersMentioned && usersMentioned.length > 0) {
    query = `${query} ${usersMentioned.map((user) => `${user}`).join(" ")}`;
  }
  return query;
}

function isSlackTokenRevoked(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.includes("token_revoked")
  );
}

// Helper to handle common Slack authentication errors.
// Returns an authentication error response if the error is token-related,
// or null if the error should be handled by the caller.
function handleSlackAuthError(error: unknown) {
  if (isSlackTokenRevoked(error) || isSlackMissingScope(error)) {
    return new Ok(makePersonalAuthenticationError("slack").content);
  }
  return null;
}

export interface SlackPersonalToolsResult {
  searchMessagesTool: ToolDefinition;
  semanticSearchMessagesTool: ToolDefinition;
  commonTools: ToolDefinition[];
}

export function createSlackPersonalTools(
  auth: Authenticator,
  _mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): SlackPersonalToolsResult {
  const handlers: ToolHandlers<typeof SLACK_PERSONAL_TOOLS_METADATA> = {
    search_messages: async (
      {
        keywords,
        usersFrom,
        usersTo,
        usersMentioned,
        relativeTimeFrame,
        channels,
      },
      { authInfo }
    ) => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError("Unreachable: missing agentLoopRunContext.")
        );
      }

      if (keywords.length > 5) {
        return new Err(
          new MCPError(
            "The search query is too broad. Please reduce the number of keywords to 5 or less."
          )
        );
      }

      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const timeFrame = parseTimeFrame(relativeTimeFrame);

      try {
        // Keyword search in slack only support AND queries which can easily return 0 hits.
        // To avoid this, we'll simulate an OR query by searching for each keyword separately.
        // Then we will aggregate the results.
        const results: SlackSearchMatch[][] = await concurrentExecutor(
          keywords,
          async (keyword) => {
            const query = buildSlackSearchQuery(keyword, {
              timeFrame,
              channels,
              usersFrom,
              usersTo,
              usersMentioned,
            });

            return slackSearch(query, accessToken);
          },
          { concurrency: 3 }
        );

        // Flatten the results.
        const rawMatches = results.flat();

        // Deduplicate matches by their permalink across keywords.
        const deduplicatedMatches = uniqBy(rawMatches, "permalink");

        // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
        const matches = deduplicatedMatches.slice(
          0,
          SLACK_SEARCH_ACTION_NUM_RESULTS
        );

        if (matches.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No messages found.`,
            },
          ]);
        }

        const { citationsOffset } = agentLoopContext.runContext.stepContext;

        const refs = getRefs().slice(
          citationsOffset,
          citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
        );

        const searchResults = buildSearchResults<SlackSearchMatch>(
          matches,
          refs,
          {
            permalink: (match) => match.permalink,
            text: (match) => formatSlackMessageForDisplay(match),
            id: (match) => match.message_ts ?? "",
            content: (match) => match.content ?? "",
          }
        );

        return new Ok(
          searchResults.map((result) => ({
            type: "resource" as const,
            resource: result,
          }))
        );
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error searching messages: ${normalizeError(error)}`)
        );
      }
    },

    semantic_search_messages: async (
      {
        query,
        usersFrom,
        usersTo,
        usersMentioned,
        relativeTimeFrame,
        channels,
      },
      { authInfo }
    ) => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError("Unreachable: missing agentLoopRunContext.")
        );
      }

      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const timeFrame = parseTimeFrame(relativeTimeFrame);

      try {
        const searchQuery = buildSlackSearchQuery(query, {
          timeFrame,
          channels,
          usersFrom,
          usersTo,
          usersMentioned,
        });

        const matches = await slackSearch(searchQuery, accessToken);

        if (matches.length === 0) {
          return new Ok([
            { type: "text" as const, text: `No messages found.` },
          ]);
        }

        const { citationsOffset } = agentLoopContext.runContext.stepContext;

        const refs = getRefs().slice(
          citationsOffset,
          citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
        );

        const searchResults = buildSearchResults<SlackSearchMatch>(
          matches,
          refs,
          {
            permalink: (match) => match.permalink,
            text: (match) => formatSlackMessageForDisplay(match),
            id: (match) => match.message_ts ?? "",
            content: (match) => match.content ?? "",
          }
        );

        return new Ok(
          searchResults.map((result) => ({
            type: "resource" as const,
            resource: result,
          }))
        );
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error searching messages: ${normalizeError(error)}`)
        );
      }
    },

    post_message: async ({ to, message, threadTs, fileId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError("Unreachable: missing agentLoopRunContext.")
        );
      }

      try {
        return await executePostMessage(auth, agentLoopContext, {
          to,
          message,
          threadTs,
          fileId,
          accessToken,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error posting message: ${normalizeError(error)}`)
        );
      }
    },

    schedule_message: async (
      { to, message, post_at, threadTs },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError("Unreachable: missing agentLoopRunContext.")
        );
      }

      try {
        return await executeScheduleMessage(auth, agentLoopContext, {
          to,
          message,
          post_at,
          threadTs,
          accessToken,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error scheduling message: ${normalizeError(error)}`)
        );
      }
    },

    list_users: async ({ nameFilter, includeUserGroups }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeListUsers({
          nameFilter,
          accessToken,
          includeUserGroups,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error listing users: ${normalizeError(error)}`)
        );
      }
    },

    get_user: async ({ userId }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeGetUser({ userId, accessToken });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error retrieving user info: ${normalizeError(error)}`)
        );
      }
    },

    search_channels: async ({ query, scope }, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      try {
        return await executeSearchChannels(query, scope, {
          accessToken,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error searching channels: ${normalizeError(error)}`)
        );
      }
    },

    list_messages: async ({ channel, relativeTimeFrame }, { authInfo }) => {
      if (!agentLoopContext?.runContext) {
        return new Err(
          new MCPError("Unreachable: missing agentLoopRunContext.")
        );
      }

      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      const slackClient = await getSlackClient(accessToken);
      const timeFrame = parseTimeFrame(relativeTimeFrame);

      // Resolve channel name to channel ID (supports public, private channels, and DMs).
      let channelId: string | null;
      try {
        channelId = await resolveChannelId({
          channelNameOrId: channel,
          accessToken,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error resolving channel: ${normalizeError(error)}`)
        );
      }

      if (!channelId) {
        return new Err(
          new MCPError(
            `Unable to find channel "${channel}". Make sure the channel exists and you have access to it.`
          )
        );
      }

      // Calculate timestamp for timeFrame filtering.
      const oldest = timeFrame
        ? (timeFrameFromNow(timeFrame) / 1000).toString()
        : undefined;

      // Use conversations.history to get messages, which works for public, private channels, and DMs.
      let response;
      try {
        response = await slackClient.conversations.history({
          channel: channelId,
          oldest,
          limit: SLACK_THREAD_LISTING_LIMIT,
        });
      } catch (error) {
        const authError = handleSlackAuthError(error);
        if (authError) {
          return authError;
        }
        return new Err(
          new MCPError(`Error fetching messages: ${normalizeError(error)}`)
        );
      }

      if (!response.ok) {
        // Trigger authentication flow for missing_scope.
        if (response.error === "missing_scope") {
          return new Ok(makePersonalAuthenticationError("slack").content);
        }
        return new Err(
          new MCPError(response.error ?? "Failed to list threads")
        );
      }

      const rawMessages = response.messages ?? [];

      // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS messages.
      const matches = rawMessages.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

      if (matches.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: `No messages found.`,
          },
        ]);
      }

      // Get display name for the channel.
      const displayName = await resolveChannelDisplayName({
        channelId,
        accessToken,
      });

      const { citationsOffset } = agentLoopContext.runContext.stepContext;

      const refs = getRefs().slice(
        citationsOffset,
        citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
      );

      // Resolve user display names for all thread authors.
      const threadsWithAuthors = await Promise.all(
        matches.map(async (match) => {
          const authorName = match.user
            ? await resolveUserDisplayName({
                userId: match.user,
                accessToken,
              })
            : null;
          return {
            ...match,
            authorName: authorName ?? "Unknown",
          };
        })
      );

      const searchResults = buildSearchResults<{
        permalink?: string;
        text?: string;
        ts?: string;
        authorName: string;
        reply_count?: number;
      }>(threadsWithAuthors, refs, {
        permalink: (match) => match.permalink,
        text: (match) => {
          const hasReplies = match.reply_count && match.reply_count > 0;
          const prefix = hasReplies
            ? `[Thread: ${match.ts}]`
            : `[Message: ${match.ts}]`;
          return `${prefix} From ${match.authorName} in ${displayName}: ${match.text ?? ""}`;
        },
        id: (match) => match.ts ?? "",
        content: (match) => match.text ?? "",
      });

      return new Ok(
        searchResults.map((result) => ({
          type: "resource" as const,
          resource: result,
        }))
      );
    },

    read_thread_messages: async (
      { channel, threadTs, limit, cursor, oldest, latest },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return new Err(new MCPError("Access token not found"));
      }

      return executeReadThreadMessages({
        channel,
        threadTs,
        limit,
        cursor,
        oldest,
        latest,
        accessToken,
      });
    },
  };

  const tools = buildTools(SLACK_PERSONAL_TOOLS_METADATA, handlers);

  const searchMessagesTool = tools.find((t) => t.name === "search_messages")!;
  const semanticSearchMessagesTool = tools.find(
    (t) => t.name === "semantic_search_messages"
  )!;
  const commonTools = tools.filter(
    (t) => t.name !== "search_messages" && t.name !== "semantic_search_messages"
  );

  return {
    searchMessagesTool,
    semanticSearchMessagesTool,
    commonTools,
  };
}

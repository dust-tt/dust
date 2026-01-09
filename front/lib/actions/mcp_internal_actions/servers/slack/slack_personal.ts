import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import uniqBy from "lodash/uniqBy";
import { z } from "zod";

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
  MAX_CHANNEL_SEARCH_RESULTS,
  resolveChannelDisplayName,
  resolveChannelId,
  resolveUserDisplayName,
  SLACK_THREAD_LISTING_LIMIT,
} from "@app/lib/actions/mcp_internal_actions/servers/slack/helpers";
import {
  makeInternalMCPServer,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { SLACK_SEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { TimeFrame } from "@app/types";
import {
  Err,
  Ok,
  parseTimeFrame,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

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

// We use a single tool name for monitoring given the high granularity (can be revisited).
const SLACK_TOOL_LOG_NAME = "slack";

export const slackSearch = async (
  query: string,
  accessToken: string,
  includeBots = false
): Promise<SlackSearchMatch[]> => {
  // Try assistant.search.context first (requires special token and Slack AI enabled).
  try {
    const params = new URLSearchParams({
      query,
      sort: "score",
      sort_dir: "desc",
      limit: SLACK_SEARCH_ACTION_NUM_RESULTS.toString(),
      channel_types: "public_channel,private_channel,mpim,im",
      include_bots: includeBots.toString(),
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
    const matches = matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

    return matches;
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

// Common Zod parameter schema parts shared by search tools.
const buildCommonSearchParams = () => ({
  channels: z
    .string()
    .array()
    .optional()
    .describe("Narrow the search to specific channels (optional)"),
  usersFrom: z
    .string()
    .array()
    .optional()
    .describe(
      "Narrow the search to messages wrote by specific users ids (optional)"
    ),
  usersTo: z
    .string()
    .array()
    .optional()
    .describe(
      "Narrow the search to direct messages sent to specific user IDs (optional)"
    ),
  usersMentioned: z
    .string()
    .array()
    .optional()
    .describe(
      "Narrow the search to messages mentioning specific users ids (optional)"
    ),
  includeBots: z
    .boolean()
    .optional()
    .describe(
      "Whether the results should include bots (optional, default: false)"
    ),
  relativeTimeFrame: z
    .string()
    .regex(/^(all|\d+[hdwmy])$/)
    .describe(
      "The time frame (relative to LOCAL_TIME) to restrict the search based" +
        " on the user request and past conversation context." +
        " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
        " where {k} is a number. Be strict, do not invent invalid values." +
        " Also, do not pass this unless the user explicitly asks for some timeframe."
    ),
});

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

// 'disconnected' is expected when we don't have a Slack connection yet.
type SlackAIStatus = "enabled" | "disabled" | "disconnected";

async function getSlackAIEnablementStatus({
  accessToken,
}: {
  accessToken: string;
}): Promise<SlackAIStatus> {
  try {
    // Use assistant.search.info to detect if Slack AI is enabled at workspace level
    // This endpoint requires search:read.public scope and returns is_ai_search_enabled boolean
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

    // Check both HTTP ok and Slack API ok for robustness
    if (!data.ok) {
      return "disconnected";
    }

    const status = data.is_ai_search_enabled ? "enabled" : "disabled";

    return status;
  } catch {
    return "disconnected";
  }
}

async function createServer(
  auth: Authenticator,
  mcpServerId: string,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("slack");

  const c = await getConnectionForMCPServer(auth, {
    mcpServerId,
    connectionType: "workspace", // Always get the admin token.
  });

  const slackAIStatus: SlackAIStatus = c
    ? await getSlackAIEnablementStatus({ accessToken: c.access_token })
    : "disconnected";

  localLogger.info(
    {
      mcpServerId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      slackAIStatus,
    },
    "Slack MCP server initialized"
  );

  // If we're not connected to Slack, we arbitrarily include the first search tool, just so there is one.
  // in the list. As soon as we're connected, it will show the correct one.
  if (slackAIStatus === "disabled" || slackAIStatus === "disconnected") {
    server.tool(
      "search_messages",
      "Search messages across public channels, private channels, DMs, and group DMs where the current user is a member",
      {
        keywords: z
          .string()
          .array()
          .min(1)
          .describe(
            "Between 1 and 3 keywords to retrieve relevant messages " +
              "based on the user request and conversation context."
          ),
        ...buildCommonSearchParams(),
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
          agentLoopContext,
        },
        async (
          {
            keywords,
            usersFrom,
            usersTo,
            usersMentioned,
            includeBots,
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
            return new Err(new MCPError("Unreachable: missing access token."));
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

                return slackSearch(query, accessToken, includeBots);
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
            } else {
              const { citationsOffset } =
                agentLoopContext.runContext.stepContext;

              const refs = getRefs().slice(
                citationsOffset,
                citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
              );

              const results = buildSearchResults<SlackSearchMatch>(
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
                results.map((result) => ({
                  type: "resource" as const,
                  resource: result,
                }))
              );
            }
          } catch (error) {
            const authError = handleSlackAuthError(error);
            if (authError) {
              return authError;
            }
            return new Err(new MCPError(`Error searching messages: ${error}`));
          }
        }
      )
    );
  }

  if (slackAIStatus === "enabled") {
    server.tool(
      "semantic_search_messages",
      "Use semantic search to find messages across public channels, private channels, DMs, and group DMs where the current user is a member",
      {
        query: z
          .string()
          .describe(
            "A query to retrieve relevant messages based on the user request and conversation context. For it to be treated as semantic search, make sure it begins with a question word such as what, where, how, etc, and ends with a question mark. If the user asks to limit to certain channels, don't make them part of this query. Instead, use the `channels` parameter to limit the search to specific channels. But only do this if the user explicitly asks for it, otherwise, the search will be more effective if you don't limit it to specific channels."
          ),
        ...buildCommonSearchParams(),
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
          agentLoopContext,
        },
        async (
          {
            query,
            usersFrom,
            usersTo,
            usersMentioned,
            includeBots,
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
            return new Err(new MCPError("Unreachable: missing access token."));
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

            const matches = await slackSearch(
              searchQuery,
              accessToken,
              includeBots
            );

            if (matches.length === 0) {
              return new Ok([
                { type: "text" as const, text: `No messages found.` },
              ]);
            } else {
              const { citationsOffset } =
                agentLoopContext.runContext.stepContext;

              const refs = getRefs().slice(
                citationsOffset,
                citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
              );

              const results = buildSearchResults<SlackSearchMatch>(
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
                results.map((result) => ({
                  type: "resource" as const,
                  resource: result,
                }))
              );
            }
          } catch (error) {
            const authError = handleSlackAuthError(error);
            if (authError) {
              return authError;
            }
            return new Err(new MCPError(`Error searching messages: ${error}`));
          }
        }
      )
    );
  }

  server.tool(
    "post_message",
    "Post a message to a public channel, private channel, or DM. You MUST ONLY post to channels or users that were explicitly specified by the user in their request. NEVER post to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    {
      to: z
        .string()
        .describe(
          "The channel or user to post the message to. Accepted values are the channel name, the channel id or the user id. If you need to find the user id, you can use the `list_users` tool. " +
            "Messages sent to a user will be sent as a direct message."
        ),
      message: z
        .string()
        .describe(
          "The message to post, must follow the Slack message formatting rules. " +
            "To mention a user, use <@user_id> (use the user's id field, not name). " +
            "To mention a user group, use <!subteam^user_group_id> (use the user group's id field, not handle)."
        ),
      threadTs: z
        .string()
        .optional()
        .describe(
          "The thread ts of the message to reply to. If you need to find the thread ts, you can use the `search_messages` tool, the thread ts is the id of the message you want to reply to. If you don't provide a thread ts, the message will be posted as a top-level message."
        ),
      fileId: z
        .string()
        .optional()
        .describe("The file id of the file to attach to the message."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ to, message, threadTs, fileId }, { authInfo }) => {
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
          return await executePostMessage(
            auth,
            agentLoopContext,
            {
              to,
              message,
              threadTs,
              fileId,
              accessToken,
            },
            mcpServerId
          );
        } catch (error) {
          const authError = handleSlackAuthError(error);
          if (authError) {
            return authError;
          }
          return new Err(new MCPError(`Error posting message: ${error}`));
        }
      }
    )
  );

  server.tool(
    "schedule_message",
    "Schedule a message to be posted to a channel at a future time. Messages can be scheduled up to 120 days in advance. Maximum of 30 scheduled messages per 5 minutes per channel. You MUST ONLY schedule messages to channels or users that were explicitly specified by the user in their request. NEVER schedule messages to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    {
      to: z
        .string()
        .describe(
          "The channel or user to schedule the message to. Accepted values are the channel name, the channel id or the user id. If you need to find the user id, you can use the `list_users` tool. " +
            "Messages sent to a user will be sent as a direct message."
        ),
      message: z
        .string()
        .describe(
          "The message to post, must follow the Slack message formatting rules. " +
            "To mention a user, use <@user_id> (use the user's id field, not name). " +
            "To mention a user group, use <!subteam^user_group_id> (use the user group's id field, not handle)."
        ),
      post_at: z
        .union([z.number().int().positive(), z.string()])
        .describe(
          "When to post the message. Can be either: (1) A Unix timestamp in seconds (e.g., 1730380000), or (2) An ISO 8601 datetime string (e.g., '2025-10-31T14:55:00Z' or '2025-10-31T14:55:00+01:00'). The time must be in the future and within 120 days from now."
        ),
      threadTs: z
        .string()
        .optional()
        .describe(
          "The thread ts of the message to reply to. If you need to find the thread ts, you can use the `search_messages` tool, the thread ts is the id of the message you want to reply to. If you don't provide a thread ts, the message will be posted as a top-level message."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ to, message, post_at, threadTs }, { authInfo }) => {
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
          return new Err(new MCPError(`Error scheduling message: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_users",
    "List all users in the workspace, and optionally user groups",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the user to filter by (optional)"),
      includeUserGroups: z
        .boolean()
        .optional()
        .describe(
          "If true, also include user groups in the response (optional, default: false)"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ nameFilter, includeUserGroups }, { authInfo }) => {
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
          return new Err(new MCPError(`Error listing users: ${error}`));
        }
      }
    )
  );

  server.tool(
    "get_user",
    "Get user information given a Slack user ID. Use this to retrieve details about a user when you have their user ID.",
    {
      userId: z
        .string()
        .describe("The Slack user ID to look up (for example: U0123456789)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ userId }, { authInfo }) => {
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
          return new Err(new MCPError(`Error retrieving user info: ${error}`));
        }
      }
    )
  );

  server.tool(
    "search_channels",
    `Search for Slack channels by ID or name.

AUTOMATIC DETECTION:
- If query is a channel ID (e.g., 'C01234ABCD', 'D01234ABCD'), retrieves that specific channel directly
- If query is text (e.g., 'marketing', 'team-eng'), searches across channel names, topics, and purpose descriptions. Returns top ${MAX_CHANNEL_SEARCH_RESULTS} matches.

SCOPE BEHAVIOR (only applies to text searches, ignored for channel IDs):
- 'auto' (default): Searches user's joined channels (public, private, im and mpim) first, then automatically falls back to all public workspace channels if no results found
- 'joined': Searches ONLY in user's joined channels (no fallback)
- 'all': Searches ONLY in all public workspace channels

IMPORTANT: Always use 'auto' scope unless the user explicitly requests a specific scope.

`,
    {
      query: z
        .string()
        .describe(
          "Channel ID (e.g., 'C01234ABCD'), channel name, or search keywords. Channel IDs are automatically detected."
        ),
      scope: z
        .enum(["auto", "joined", "all"])
        .default("auto")
        .describe(
          "'auto' (default, always use this unless user specifies), 'joined' (only joined channels), 'all' (only public channels). Ignored when query is a channel ID."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ query, scope }, { authInfo }) => {
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
          return new Err(new MCPError(`Error searching channels: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_threads",
    "List threads for a given channel, private channel, or DM. Returns thread headers with timestamps (ts field). Use read_thread_messages with the ts field to read the full thread content.",
    {
      channel: z
        .string()
        .describe(
          "The channel name, channel ID, or user ID to list threads for. Supports public channels, private channels, and DMs."
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .describe(
          "The time frame (relative to LOCAL_TIME) to restrict the search based" +
            " on the user request and past conversation context." +
            " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
            " where {k} is a number. Be strict, do not invent invalid values."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ channel, relativeTimeFrame }, { authInfo }) => {
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
          return new Err(new MCPError(`Error resolving channel: ${error}`));
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
          return new Err(new MCPError(`Error fetching messages: ${error}`));
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

        // Filter to only keep messages that have threads (reply_count > 0).
        const threadsOnly = rawMessages.filter(
          (msg) => msg.reply_count && msg.reply_count > 0
        );

        // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS threads.
        const matches = threadsOnly.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

        if (matches.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No threads found.`,
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

        const results = buildSearchResults<{
          permalink?: string;
          text?: string;
          ts?: string;
          authorName: string;
        }>(threadsWithAuthors, refs, {
          permalink: (match) => match.permalink,
          text: (match) =>
            `[Thread: ${match.ts}] From ${match.authorName} in ${displayName}: ${match.text ?? ""}`,
          id: (match) => match.ts ?? "",
          content: (match) => match.text ?? "",
        });

        return new Ok(
          results.map((result) => ({
            type: "resource" as const,
            resource: result,
          }))
        );
      }
    )
  );

  server.tool(
    "read_thread_messages",
    "Read all messages in a specific thread from public channels, private channels, or DMs. Use list_threads first to find thread timestamps (ts field).",
    {
      channel: z
        .string()
        .describe(
          "Channel name, channel ID, or user ID where the thread is located. Supports public channels, private channels, and DMs."
        ),
      threadTs: z
        .string()
        .describe(
          "Thread timestamp (ts field from list_threads results, identifies the parent message)"
        ),
      limit: z
        .number()
        .optional()
        .describe("Number of messages to retrieve (default: 20, max: 200)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from previous call to get next page"),
      oldest: z
        .string()
        .optional()
        .describe("Only messages after this timestamp (Unix timestamp)"),
      latest: z
        .string()
        .optional()
        .describe("Only messages before this timestamp (Unix timestamp)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async (
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
      }
    )
  );

  return server;
}

export default createServer;

import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import uniqBy from "lodash/uniqBy";
import { z } from "zod";

import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderRelativeTimeFrameForToolOutput } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  executeGetUser,
  executeListChannels,
  executeListJoinedChannels,
  executeListUsers,
  executePostMessage,
  executeReadThreadMessages,
  getSlackClient,
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
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { TimeFrame } from "@app/types";
import {
  Err,
  Ok,
  parseTimeFrame,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

export type SlackSearchMatch = {
  author_name?: string;
  channel_name?: string;
  message_ts?: string;
  content?: string;
  permalink?: string;
};

// We use a single tool name for monitoring given the high granularity (can be revisited).
const SLACK_TOOL_LOG_NAME = "slack";

export const slackSearch = async (
  query: string,
  accessToken: string
): Promise<SlackSearchMatch[]> => {
  // Try assistant.search.context first (requires special token and Slack AI enabled)
  try {
    const params = new URLSearchParams({
      query,
      sort: "score",
      sort_dir: "desc",
      limit: SLACK_SEARCH_ACTION_NUM_RESULTS.toString(),
    });

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

    type SlackSearchResponse = {
      ok: boolean;
      error?: string;
      results: {
        messages: SlackSearchMatch[];
      };
    };

    const data: SlackSearchResponse =
      (await resp.json()) as SlackSearchResponse;
    if (!data.ok) {
      // If invalid_action_token or other errors, throw to trigger fallback
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      throw new Error(data.error || "unknown_error");
    }

    const rawMatches: SlackSearchMatch[] = data.results.messages;

    // Filter out matches that don't have a text.
    const matchesWithText = rawMatches.filter((match) => !!match.content);

    // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
    const matches = matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

    return matches;
  } catch (error) {
    // Fallback to standard search.messages API if assistant.search.context fails
    logger.info(
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
      throw new Error(response.error ?? "unknown_error");
    }

    const rawMatches = response.messages?.matches ?? [];

    // Transform to match expected format
    const matches: SlackSearchMatch[] = rawMatches.map((match) => ({
      author_name: match.username,
      channel_name: match.channel?.name,
      message_ts: match.ts,
      content: match.text,
      permalink: match.permalink,
    }));

    // Filter out matches that don't have text
    const matchesWithText = matches.filter((match) => !!match.content);

    // Keep only the top results
    return matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);
  }
};

// Helper function to format date as YYYY-MM-DD with zero-padding
function formatDateForSlackQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper function to build search results from matches
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

function makeQueryResource(
  keywords: string[],
  relativeTimeFrame: TimeFrame | null,
  channels?: string[],
  usersFrom?: string[],
  usersTo?: string[],
  usersMentioned?: string[]
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);
  let text = `Searching Slack ${timeFrameAsString}`;
  if (keywords.length > 0) {
    text += ` with keywords: ${keywords.join(", ")}`;
  }
  if (channels && channels.length > 0) {
    text += ` in channels: ${channels.join(", ")}`;
  }
  if (usersFrom && usersFrom.length > 0) {
    text += ` from users: ${usersFrom.join(", ")}`;
  }
  if (usersTo && usersTo.length > 0) {
    text += ` to users: ${usersTo.join(", ")}`;
  }
  if (usersMentioned && usersMentioned.length > 0) {
    text += ` mentioning users: ${usersMentioned.join(", ")}`;
  }

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text,
    uri: "",
  };
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
    (error as any).message &&
    (error as any).message.toString().includes("token_revoked")
  );
}

// 'disconnected' is expected when we don't have a Slack connection yet
type SlackAIStatus = "enabled" | "disabled" | "disconnected";

const SLACK_AI_STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type GetSlackAIEnablementStatusArgs = {
  mcpServerId: string;
  accessToken: string;
};

const _getSlackAIEnablementStatus = async ({
  accessToken,
}: {
  accessToken: string;
}): Promise<SlackAIStatus> => {
  try {
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
      logger.warn("assistant.search.info returned !ok");
      return "disconnected";
    }

    const assistantSearchInfoJson = await assistantSearchInfo.json();

    return assistantSearchInfoJson.is_ai_search_enabled
      ? "enabled"
      : "disabled";
  } catch (e) {
    logger.warn({ error: e }, "Error fetching Slack AI enablement status");
    return "disconnected";
  }
};

// Cache the result as this involves a call to the Slack API
// We use a hash of the access token as the cache key to avoid storing sensitive information directly
const getCachedSlackAIEnablementStatus = cacheWithRedis(
  _getSlackAIEnablementStatus,
  ({ mcpServerId }: GetSlackAIEnablementStatusArgs) => mcpServerId,
  {
    ttlMs: SLACK_AI_STATUS_CACHE_TTL_MS,
  }
);

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
    ? await getCachedSlackAIEnablementStatus({
        mcpServerId,
        accessToken: c.access_token,
      })
    : "disconnected";

  // If we're not connected to Slack, we arbitrarily include the first search tool, just so there is one
  // in the list. As soon as we're connected, it will show the correct one.
  if (slackAIStatus === "disabled" || slackAIStatus === "disconnected") {
    server.tool(
      "search_messages",
      "Search messages across all channels and DMs for the current user",
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
                {
                  type: "resource" as const,
                  resource: makeQueryResource(
                    keywords,
                    timeFrame,
                    channels,
                    usersFrom,
                    usersTo,
                    usersMentioned
                  ),
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
                  text: (match) =>
                    `#${match.channel_name ?? "Unknown"}, ${match.content ?? ""}`,
                  id: (match) => match.message_ts ?? "",
                  content: (match) => match.content ?? "",
                }
              );

              return new Ok([
                ...results.map((result) => ({
                  type: "resource" as const,
                  resource: result,
                })),
                {
                  type: "resource" as const,
                  resource: makeQueryResource(
                    keywords,
                    timeFrame,
                    channels,
                    usersFrom,
                    usersTo,
                    usersMentioned
                  ),
                },
              ]);
            }
          } catch (error) {
            if (isSlackTokenRevoked(error)) {
              return new Ok(makePersonalAuthenticationError("slack").content);
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
      "Use semantic search to find messages across all channels and DMs for the current user",
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

            const matches = await slackSearch(searchQuery, accessToken);

            if (matches.length === 0) {
              return new Ok([
                { type: "text" as const, text: `No messages found.` },
                {
                  type: "resource" as const,
                  resource: makeQueryResource(
                    [query],
                    timeFrame,
                    channels,
                    usersFrom,
                    usersTo,
                    usersMentioned
                  ),
                },
              ]);
            } else {
              const { citationsOffset } =
                agentLoopContext.runContext.stepContext;

              const refs = getRefs().slice(
                citationsOffset,
                citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
              );

              const getTextFromMatch = (match: SlackSearchMatch) => {
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                const author = match.author_name || "Unknown";
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                const channel = match.channel_name || "Unknown";
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                let content = match.content || "";

                // assistant.search.context wraps search words in \uE000 and \uE001,
                // which display as squares in the UI, so we strip them out.
                // Ideally, there would be a way to disable this behavior in the Slack API.
                content = content.replace(/[\uE000\uE001]/g, "");

                // Replace <@U050CALAKFD|someone> with just @someone
                content = content.replace(
                  /<@([A-Z0-9]+)\|([^>]+)>/g,
                  (_m, _id, username) => `@${username}`
                );

                return `From ${author} in #${channel}: ${content}`;
              };

              const results = buildSearchResults<SlackSearchMatch>(
                matches,
                refs,
                {
                  permalink: (match) => match.permalink,
                  text: (match) => getTextFromMatch(match),
                  id: (match) => match.message_ts ?? "",
                  content: (match) => match.content ?? "",
                }
              );

              return new Ok([
                ...results.map((result) => ({
                  type: "resource" as const,
                  resource: result,
                })),
                {
                  type: "resource" as const,
                  resource: makeQueryResource(
                    [query],
                    timeFrame,
                    channels,
                    usersFrom,
                    usersTo,
                    usersMentioned
                  ),
                },
              ]);
            }
          } catch (error) {
            if (isSlackTokenRevoked(error)) {
              return new Ok(makePersonalAuthenticationError("slack").content);
            }
            return new Err(new MCPError(`Error searching messages: ${error}`));
          }
        }
      )
    );
  }

  server.tool(
    "post_message",
    "Post a message to a public channel, private channel, or DM",
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
          "The message to post, must follow the Slack message formatting rules."
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
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error posting message: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_users",
    "List all users in the workspace",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the user to filter by (optional)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ nameFilter }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Access token not found"));
        }

        try {
          return await executeListUsers(nameFilter, accessToken);
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
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
          return await executeGetUser(userId, accessToken);
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error retrieving user info: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_channels",
    "List all public channels of the workspace and only the private channels where you are currently a member",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the channel to filter by (optional)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ nameFilter }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Access token not found"));
        }

        try {
          return await executeListChannels(
            nameFilter,
            accessToken,
            mcpServerId
          );
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error listing channels: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_joined_channels",
    "List only public and private channels where you are currently a member",
    {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the channel to filter by (optional)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ nameFilter }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Access token not found"));
        }

        try {
          return await executeListJoinedChannels(
            nameFilter,
            accessToken,
            mcpServerId
          );
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error listing channels: ${error}`));
        }
      }
    )
  );

  server.tool(
    "list_threads",
    "List threads for a given channel. Returns thread headers with timestamps (ts field). Use read_thread_messages with the ts field to read the full thread content.",
    {
      channel: z.string().describe("The channel name to list threads for."),
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

        try {
          let query = `-threads:replies in:${channel.charAt(0) === "#" ? channel : `#${channel}`}`;

          if (timeFrame) {
            const timestampInMs = timeFrameFromNow(timeFrame);
            const date = new Date(timestampInMs);
            query = `${query} after:${formatDateForSlackQuery(date)}`;
          }

          const r = await slackClient.search.messages({
            query,
            sort: "timestamp",
            sort_dir: "desc",
            highlight: false,
            count: SLACK_SEARCH_ACTION_NUM_RESULTS,
            page: 1,
          });

          if (!r.ok) {
            return new Err(new MCPError(r.error ?? "Unknown error"));
          }

          const rawMatches = r.messages?.matches ?? [];

          // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
          const matches = rawMatches.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

          if (matches.length === 0) {
            return new Ok([
              {
                type: "text" as const,
                text: `No threads found.`,
              },
              {
                type: "resource" as const,
                resource: makeQueryResource(
                  [],
                  timeFrame,
                  [channel],
                  [],
                  [],
                  []
                ),
              },
            ]);
          } else {
            const { citationsOffset } = agentLoopContext.runContext.stepContext;

            const refs = getRefs().slice(
              citationsOffset,
              citationsOffset + SLACK_SEARCH_ACTION_NUM_RESULTS
            );

            const results = buildSearchResults<{
              permalink?: string;
              channel?: { name?: string };
              text?: string;
              ts?: string;
            }>(matches, refs, {
              permalink: (match) => match.permalink,
              text: (match) =>
                `#${match.channel?.name ?? "Unknown"}, ${match.text ?? ""}`,
              id: (match) => match.ts ?? "",
              content: (match) => match.text ?? "",
            });

            return new Ok([
              ...results.map((result) => ({
                type: "resource" as const,
                resource: result,
              })),
              {
                type: "resource" as const,
                resource: makeQueryResource(
                  [],
                  timeFrame,
                  [channel],
                  [],
                  [],
                  []
                ),
              },
            ]);
          }
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error listing threads: ${error}`));
        }
      }
    )
  );

  server.tool(
    "read_thread_messages",
    "Read all messages in a specific thread. Use list_threads first to find thread timestamps (ts field).",
    {
      channel: z
        .string()
        .describe("Channel name or ID where the thread is located"),
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

        return executeReadThreadMessages(
          channel,
          threadTs,
          limit,
          cursor,
          oldest,
          latest,
          accessToken
        );
      }
    )
  );

  return server;
}

export default createServer;

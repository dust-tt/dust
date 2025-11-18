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
  executeScheduleMessage,
  getSlackClient,
  resolveChannelDisplayName,
  resolveChannelId,
  resolveUserDisplayName,
  resolveUsername,
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
  // Try assistant.search.context first (requires special token and Slack AI enabled).
  try {
    const params = new URLSearchParams({
      query,
      sort: "score",
      sort_dir: "desc",
      limit: SLACK_SEARCH_ACTION_NUM_RESULTS.toString(),
      // Search across all conversation types: public channels, private channels, DMs, and group DMs.
      channel_types: "public_channel,private_channel,mpim,im",
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
      // If invalid_action_token or other errors, throw to trigger fallback.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      throw new Error(data.error || "unknown_error");
    }

    const rawMatches = data.results.messages;

    // Map API response to SlackSearchMatch format.
    // For DMs, channel_id is the user ID that needs to be resolved.
    const mappedMatches: SlackSearchMatch[] = rawMatches.map((msg: any) => ({
      author_name: msg.author_user_id,
      channel_name: msg.channel_id, // For DMs, this will be a user ID (U...)
      message_ts: msg.message_ts,
      content: msg.content,
      permalink: msg.permalink,
    }));

    // Filter out matches that don't have a text.
    const matchesWithText = mappedMatches.filter((match) => !!match.content);

    // Keep only the top SLACK_SEARCH_ACTION_NUM_RESULTS matches.
    const matches = matchesWithText.slice(0, SLACK_SEARCH_ACTION_NUM_RESULTS);

    return matches;
  } catch (error) {
    // Fallback to standard search.messages API if assistant.search.context fails.
    // This typically happens when Slack AI is not enabled (local env) or the token doesn't have the required permissions.
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
      author_name: match.username,
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
const buildCommonSearchParams = (forSemanticSearch: boolean = false) => ({
  channels: z
    .string()
    .array()
    .optional()
    .describe(
      forSemanticSearch
        ? "Narrow the search to specific channels (optional). ONLY use if the user EXPLICITLY requests searching in specific channels. Leave empty otherwise for better semantic search results."
        : "Narrow the search to specific channels (optional)"
    ),
  usersFrom: z
    .string()
    .array()
    .optional()
    .describe(
      forSemanticSearch
        ? "Narrow the search to messages written by specific user IDs (optional). ONLY use if the user EXPLICITLY requests messages from specific users (e.g., 'messages from John'). Leave empty otherwise for better semantic search results, as this adds keyword filters that reduce semantic search effectiveness."
        : "Narrow the search to messages wrote by specific users ids (optional)"
    ),
  usersTo: z
    .string()
    .array()
    .optional()
    .describe(
      forSemanticSearch
        ? "Narrow the search to direct messages sent to specific user IDs (optional). ONLY use if the user EXPLICITLY requests DMs to specific users (e.g., 'my DMs to Sarah'). Leave empty otherwise for better semantic search results, as this adds keyword filters that reduce semantic search effectiveness."
        : "Narrow the search to direct messages sent to specific user IDs (optional)"
    ),
  usersMentioned: z
    .string()
    .array()
    .optional()
    .describe(
      forSemanticSearch
        ? "Narrow the search to messages that mention specific user IDs (optional). ONLY use if the user EXPLICITLY requests messages mentioning specific users (e.g., 'messages mentioning @John'). Leave empty otherwise for better semantic search results, as this adds keyword filters that reduce semantic search effectiveness."
        : "Narrow the search to messages that mention specific user IDs (optional)"
    ),
  relativeTimeFrame: z
    .string()
    .regex(/^(all|\d+[hdwmy])$/)
    .default("all")
    .describe(
      "The time frame (relative to LOCAL_TIME) to restrict the search based" +
        " on the user request and past conversation context." +
        " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
        " where {k} is a number. Be strict, do not invent invalid values." +
        " Default is 'all' which searches across all time."
    ),
});

async function buildSlackSearchQuery(
  initial: string,
  {
    timeFrame,
    channels,
    usersFrom,
    usersTo,
    usersMentioned,
    accessToken,
    mcpServerId,
  }: {
    timeFrame: TimeFrame | null;
    channels?: string[];
    usersFrom?: string[];
    usersTo?: string[];
    usersMentioned?: string[];
    accessToken: string;
    mcpServerId: string;
  }
): Promise<string> {
  let query = initial;
  if (timeFrame) {
    const timestampInMs = timeFrameFromNow(timeFrame);
    const date = new Date(timestampInMs);
    query = `${query} after:${formatDateForSlackQuery(date)}`;
  }
  if (channels && channels.length > 0) {
    // For Slack search API, we need to use channel names, not IDs.
    // First, resolve channel names/IDs to get the actual channel objects.
    const slackClient = await getSlackClient(accessToken);
    const resolvedChannels = await Promise.all(
      channels.map(async (channel) => {
        const channelId = await resolveChannelId(
          channel,
          accessToken,
          mcpServerId
        );
        if (!channelId) {
          return null;
        }

        // Get channel info to retrieve the channel name.
        try {
          const channelInfo = await slackClient.conversations.info({
            channel: channelId,
          });
          if (channelInfo.ok && channelInfo.channel?.name) {
            return channelInfo.channel.name;
          }
        } catch (error) {
          // If we can't get channel info, skip this channel.
        }
        return null;
      })
    );

    // Build query with channel names (not IDs).
    // Use in:#channel-name format as required by Slack search API.
    const channelQueries = resolvedChannels
      .filter((name): name is string => name !== null)
      .map((name) => `in:#${name}`)
      .join(" ");

    if (channelQueries) {
      query = `${query} ${channelQueries}`;
    }
  }
  // Resolve user IDs to usernames for search queries.
  if (usersFrom && usersFrom.length > 0) {
    const resolvedUsersFrom = await Promise.all(
      usersFrom.map(async (user) => {
        // If it looks like a user ID (starts with U), resolve it to username
        if (user.match(/^U[A-Z0-9]+$/)) {
          const username = await resolveUsername(user, accessToken);
          return username ?? user;
        }
        return user;
      })
    );
    query = `${query} ${resolvedUsersFrom.map((user) => `from:@${user}`).join(" ")}`;
  }
  if (usersTo && usersTo.length > 0) {
    const resolvedUsersTo = await Promise.all(
      usersTo.map(async (user) => {
        // If it looks like a user ID (starts with U), resolve it to username
        if (user.match(/^U[A-Z0-9]+$/)) {
          const username = await resolveUsername(user, accessToken);
          return username ?? user;
        }
        return user;
      })
    );
    query = `${query} ${resolvedUsersTo.map((user) => `to:@${user}`).join(" ")}`;
  }
  if (usersMentioned && usersMentioned.length > 0) {
    const resolvedUsersMentioned = await Promise.all(
      usersMentioned.map(async (user) => {
        // If it looks like a user ID (starts with U), resolve it to username
        if (user.match(/^U[A-Z0-9]+$/)) {
          const username = await resolveUsername(user, accessToken);
          return username ?? user;
        }
        return user;
      })
    );
    query = `${query} ${resolvedUsersMentioned.map((user) => `@${user}`).join(" ")}`;
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

// 'disconnected' is expected when we don't have a Slack connection yet.
type SlackAIStatus = "enabled" | "disabled" | "disconnected";

async function getSlackAIEnablementStatus(
  accessToken: string
): Promise<SlackAIStatus> {
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
      return "disconnected";
    }

    const assistantSearchInfoJson = await assistantSearchInfo.json();

    const status = assistantSearchInfoJson.is_ai_search_enabled
      ? "enabled"
      : "disabled";

    return status;
  } catch (e) {
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
    ? await getSlackAIEnablementStatus(c.access_token)
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
                const query = await buildSlackSearchQuery(keyword, {
                  timeFrame,
                  channels,
                  usersFrom,
                  usersTo,
                  usersMentioned,
                  accessToken,
                  mcpServerId,
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

              // Resolve channel/user names for display
              const resolvedMatches = await Promise.all(
                matches.map(async (match) => {
                  const channelIdOrName = match.channel_name ?? "Unknown";
                  const displayName =
                    channelIdOrName === "Unknown"
                      ? "#Unknown"
                      : await resolveChannelDisplayName(
                          channelIdOrName,
                          accessToken
                        );

                  return { match, displayName };
                })
              );

              const results = buildSearchResults<{
                match: SlackSearchMatch;
                displayName: string;
              }>(resolvedMatches, refs, {
                permalink: (item) => item.match.permalink,
                text: (item) =>
                  `${item.displayName}, ${item.match.content ?? ""}`,
                id: (item) => item.match.message_ts ?? "",
                content: (item) => item.match.content ?? "",
              });

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
        ...buildCommonSearchParams(true),
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
            const searchQuery = await buildSlackSearchQuery(query, {
              timeFrame,
              channels,
              usersFrom,
              usersTo,
              usersMentioned,
              accessToken,
              mcpServerId,
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

              const getTextFromMatch = async (match: SlackSearchMatch) => {
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                const authorIdOrName = match.author_name || "Unknown";
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                const channelIdOrName = match.channel_name || "Unknown";
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                let content = match.content || "";

                // Resolve author user ID to display name
                const author =
                  authorIdOrName === "Unknown"
                    ? "Unknown"
                    : (await resolveUserDisplayName(
                        authorIdOrName,
                        accessToken
                      )) ?? authorIdOrName;

                // Resolve channel/user ID to display name
                let channel: string;
                if (channelIdOrName === "Unknown") {
                  channel = "#Unknown";
                } else if (channelIdOrName.startsWith("D")) {
                  // DM: channel ID starts with "D" → hardcode "a DM"
                  channel = "a DM";
                } else {
                  // Regular channel: resolve the name
                  channel = await resolveChannelDisplayName(
                    channelIdOrName,
                    accessToken
                  );
                }

                // assistant.search.context wraps search words in \uE000 and \uE001.
                // which display as squares in the UI, so we strip them out.
                // Ideally, there would be a way to disable this behavior in the Slack API.
                content = content.replace(/[\uE000\uE001]/g, "");

                // Replace <@U050CALAKFD|someone> with just @someone.
                content = content.replace(
                  /<@([A-Z0-9]+)\|([^>]+)>/g,
                  (_m, _id, username) => `@${username}`
                );

                return `From ${author} in ${channel}: ${content}`;
              };

              // Resolve all matches with user names for DMs.
              const resolvedMatches = await Promise.all(
                matches.map(async (match) => ({
                  match,
                  text: await getTextFromMatch(match),
                }))
              );

              const results = buildSearchResults<{
                match: SlackSearchMatch;
                text: string;
              }>(resolvedMatches, refs, {
                permalink: ({ match }) => match.permalink,
                text: ({ text }) => text,
                id: ({ match }) => match.message_ts ?? "",
                content: ({ match }) => match.content ?? "",
              });

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
    "schedule_message",
    "Schedule a message to be posted to a channel at a future time. Messages can be scheduled up to 120 days in advance. Maximum of 30 scheduled messages per 5 minutes per channel.",
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
          "The message to post, must follow the Slack message formatting rules."
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
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(new MCPError(`Error scheduling message: ${error}`));
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
    "get_channel_details",
    "Get detailed information about a specific channel including all metadata, properties, canvas, tabs, and settings. Use this when you need complete channel information beyond the basic fields provided by list_channels.",
    {
      channel: z.string().describe("The channel ID or name to get details for"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: SLACK_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ channel }, { authInfo }) => {
        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Err(new MCPError("Access token not found"));
        }

        try {
          const slackClient = await getSlackClient(accessToken);
          const response = await slackClient.conversations.info({
            channel,
          });

          if (!response.ok || !response.channel) {
            return new Err(new MCPError("Failed to get channel details"));
          }

          return new Ok([
            {
              type: "text" as const,
              text: `Retrieved detailed information for channel ${channel}`,
            },
            {
              type: "text" as const,
              text: JSON.stringify(response.channel, null, 2),
            },
          ]);
        } catch (error) {
          if (isSlackTokenRevoked(error)) {
            return new Ok(makePersonalAuthenticationError("slack").content);
          }
          return new Err(
            new MCPError(`Error getting channel details: ${error}`)
          );
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
          // Resolve channel name to channel ID (supports both public and private channels).
          const channelId = await resolveChannelId(
            channel,
            accessToken,
            mcpServerId
          );

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

          // Use conversations.history to get messages, which works for both public and private channels.
          const response = await slackClient.conversations.history({
            channel: channelId,
            oldest,
            limit: 100, // Get more messages to have enough threads.
          });

          if (!response.ok) {
            // Provide specific error message for missing_scope
            if (response.error === "missing_scope") {
              return new Err(
                new MCPError(
                  `Missing permission to access this channel (${channelId}). ` +
                    `Required scope: ${response.needed ?? "unknown"}. ` +
                    `Please reconnect your Slack account in the connections settings to grant the required permissions.`
                )
              );
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

            // Resolve channel ID to display name
            const displayName = await resolveChannelDisplayName(
              channelId,
              accessToken
            );

            const results = buildSearchResults<{
              text?: string;
              ts?: string;
              permalink?: string;
            }>(matches, refs, {
              permalink: (match) => match.permalink,
              text: (match) =>
                `${displayName}, ${match.text ?? "Thread with no preview"}`,
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

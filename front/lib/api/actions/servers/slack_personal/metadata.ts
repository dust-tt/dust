import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SLACK_TOOL_LOG_NAME = "slack" as const;

// Common Zod parameter schemas shared by search tools.
const commonSearchParams = {
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
};

const MAX_CHANNEL_SEARCH_RESULTS = 20;

export const SLACK_PERSONAL_TOOLS_METADATA = createToolsRecord({
  search_messages: {
    description:
      "Search messages across public channels, private channels, DMs, and group DMs where the current user is a member",
    schema: {
      keywords: z
        .string()
        .array()
        .min(1)
        .describe(
          "Between 1 and 3 keywords to retrieve relevant messages " +
            "based on the user request and conversation context."
        ),
      ...commonSearchParams,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Slack messages (keyword)",
      done: "Search Slack messages (keyword)",
    },
  },
  semantic_search_messages: {
    description:
      "Use semantic search to find messages across public channels, private channels, DMs, and group DMs where the current user is a member",
    schema: {
      query: z
        .string()
        .describe(
          "A query to retrieve relevant messages based on the user request and conversation context. For it to be treated as semantic search, make sure it begins with a question word such as what, where, how, etc, and ends with a question mark. If the user asks to limit to certain channels, don't make them part of this query. Instead, use the `channels` parameter to limit the search to specific channels. But only do this if the user explicitly asks for it, otherwise, the search will be more effective if you don't limit it to specific channels."
        ),
      ...commonSearchParams,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Slack messages (semantic)",
      done: "Search Slack messages (semantic)",
    },
  },
  post_message: {
    description:
      "Post a message to a public channel, private channel, or DM. You MUST ONLY post to channels or users that were explicitly specified by the user in their request. NEVER post to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    schema: {
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
    stake: "medium",
    displayLabels: {
      running: "Posting Slack message",
      done: "Post Slack message",
    },
  },
  schedule_message: {
    description:
      "Schedule a message to be posted to a channel at a future time. Messages can be scheduled up to 120 days in advance. Maximum of 30 scheduled messages per 5 minutes per channel. You MUST ONLY schedule messages to channels or users that were explicitly specified by the user in their request. NEVER schedule messages to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    schema: {
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
    stake: "medium",
    displayLabels: {
      running: "Scheduling Slack message",
      done: "Schedule Slack message",
    },
  },
  list_users: {
    description: "List all users in the workspace, and optionally user groups",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Listing Slack users",
      done: "List Slack users",
    },
  },
  get_user: {
    description:
      "Get user information given a Slack user ID. Use this to retrieve details about a user when you have their user ID.",
    schema: {
      userId: z
        .string()
        .describe("The Slack user ID to look up (for example: U0123456789)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Slack user",
      done: "Get Slack user",
    },
  },
  search_channels: {
    description: `Search for Slack channels by ID or name.

AUTOMATIC DETECTION:
- If query is a channel ID (e.g., 'C01234ABCD', 'D01234ABCD'), retrieves that specific channel directly
- If query is text (e.g., 'marketing', 'team-eng'), searches across channel names, topics, and purpose descriptions. Returns top ${MAX_CHANNEL_SEARCH_RESULTS} matches.

SCOPE BEHAVIOR (only applies to text searches, ignored for channel IDs):
- 'auto' (default): Searches user's joined channels (public, private, im and mpim) first, then automatically falls back to all public workspace channels if no results found
- 'joined': Searches ONLY in user's joined channels (no fallback)
- 'all': Searches ONLY in all public workspace channels

IMPORTANT: Always use 'auto' scope unless the user explicitly requests a specific scope.

`,
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Searching Slack channels",
      done: "Search Slack channels",
    },
  },
  list_messages: {
    description:
      "List messages for a given channel, private channel, or DM. Returns message headers with timestamps (ts field). Use read_thread_messages with the ts field to read the full thread content for messages that have replies.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Listing Slack messages",
      done: "List Slack messages",
    },
  },
  read_thread_messages: {
    description:
      "Read all messages in a specific thread from public channels, private channels, or DMs. Use list_messages first to find thread timestamps (ts field).",
    schema: {
      channel: z
        .string()
        .describe(
          "Channel name, channel ID, or user ID where the thread is located. Supports public channels, private channels, and DMs."
        ),
      threadTs: z
        .string()
        .describe(
          "Thread timestamp (ts field from list_messages results, identifies the parent message)"
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
    stake: "never_ask",
    displayLabels: {
      running: "Reading Slack thread messages",
      done: "Read Slack thread messages",
    },
  },
});

// Server metadata for external consumption (e.g., by SDK).
export const SLACK_PERSONAL_SERVER = {
  serverInfo: {
    name: "slack",
    version: "1.0.0",
    description:
      "Slack tools for searching and posting messages. Works with your personal Slack account and supports all common Slack operations.",
    authorization: {
      provider: "slack_tools" as const,
      supported_use_cases: ["personal_actions"] as const,
    },
    icon: "SlackLogo",
    documentationUrl: "https://docs.dust.tt/docs/slack-mcp",
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions:
      // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
      "When posting a message on Slack, you MUST use Slack-flavored Markdown to format the message. " +
      "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
      "If you want to reference a channel, you must use #CHANNEL where CHANNEL is the channel name, or <#CHANNEL_ID> where CHANNEL_ID is the channel ID.",
  },
  tools: Object.values(SLACK_PERSONAL_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SLACK_PERSONAL_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

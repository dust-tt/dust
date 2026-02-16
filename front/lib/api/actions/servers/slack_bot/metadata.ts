import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SLACK_BOT_TOOL_NAME = "slack_bot" as const;

export const SLACK_BOT_TOOLS_METADATA = createToolsRecord({
  post_message: {
    description:
      "Post a message to a Slack channel. The slack bot must be added to the channel before it can post messages. Direct messages are not supported. You MUST ONLY post to channels that were explicitly specified by the user in their request. NEVER post to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    schema: {
      to: z
        .string()
        .describe(
          "The channel to post the message to. Accepted values are the channel name or the channel id."
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
          "The thread ts of the message to reply to. If you don't provide a thread ts, the message will be posted as a top-level message."
        ),
      fileId: z
        .string()
        .optional()
        .describe(
          "Optional file id (sId) of a file in Dust to attach to the Slack message."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Posting Slack message",
      done: "Post Slack message",
    },
  },
  search_user: {
    description: `Search for a Slack user by user ID or email address.

Query parameter accepts:
- User ID (e.g., 'U01234ABCD') - instant lookup
- Email address (e.g., 'user@company.com') - instant lookup

If you only have a user's first name or partial information, ask the user to provide their email address or user ID instead of using search_all=true.

The search_all parameter should only be set to true if the user explicitly requests to search all workspace users. This operation is slow on large workspaces and should be avoided unless specifically requested.`,
    schema: {
      query: z.string().describe("User ID or email address"),
      search_all: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Only set to true if the user explicitly requests searching all workspace users. This is slow and should be avoided. Always ask the user for email/ID first."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Slack user",
      done: "Search Slack user",
    },
  },
  list_public_channels: {
    description: "List all public channels in the workspace",
    schema: {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the channel to filter by (optional)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Slack public channels",
      done: "List Slack public channels",
    },
  },
  read_channel_history: {
    description:
      "Read messages from a specific channel with pagination support. The slack bot must be added to the channel before it can read messages.",
    schema: {
      channel: z.string().describe("Channel name or ID"),
      limit: z
        .number()
        .optional()
        .describe("Number of messages to retrieve (default: 20, max: 200)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from previous call to get next page of messages"
        ),
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
      running: "Reading Slack channel history",
      done: "Read Slack channel history",
    },
  },
  read_thread_messages: {
    description:
      "Read all messages in a specific thread with pagination support",
    schema: {
      channel: z.string().describe("Channel name or ID"),
      threadTs: z
        .string()
        .describe("Thread timestamp (ts of the parent message)"),
      limit: z
        .number()
        .optional()
        .describe("Number of messages to retrieve (default: 20, max: 200)"),
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from previous call to get next page of thread messages"
        ),
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
  add_reaction: {
    description: "Add a reaction emoji to a message",
    schema: {
      channel: z.string().describe("The channel where the message is located"),
      timestamp: z
        .string()
        .describe("The timestamp of the message to react to"),
      name: z
        .string()
        .describe(
          "The name of the emoji reaction (without colons, e.g., 'thumbsup', 'heart')"
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Adding Slack reaction",
      done: "Add Slack reaction",
    },
  },
  remove_reaction: {
    description: "Remove a reaction emoji from a message",
    schema: {
      channel: z.string().describe("The channel where the message is located"),
      timestamp: z
        .string()
        .describe("The timestamp of the message to remove reaction from"),
      name: z
        .string()
        .describe(
          "The name of the emoji reaction to remove (without colons, e.g., 'thumbsup', 'heart')"
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Removing Slack reaction",
      done: "Remove Slack reaction",
    },
  },
});

export const SLACK_BOT_SERVER = {
  serverInfo: {
    name: "slack_bot",
    version: "1.0.0",
    description:
      "Specialized Slack bot integration for posting messages as the workspace bot. Limited to channels where the bot has been added.",
    authorization: {
      provider: "slack" as const,
      supported_use_cases: ["platform_actions"] as const,
    },
    icon: "SlackLogo",
    documentationUrl: null,
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions:
      "The Slack bot must be explicitly added to a channel before it can post messages or read history. " +
      "Direct messages and search operations are not supported. " +
      "When posting a message on Slack, you MUST use Slack-flavored Markdown to format the message. " +
      "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
      "If you want to reference a channel, you must use #CHANNEL where CHANNEL is the channel name, or <#CHANNEL_ID> where CHANNEL_ID is the channel ID.",
  },
  tools: Object.values(SLACK_BOT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SLACK_BOT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

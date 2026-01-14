import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Exports for monitoring
// =============================================================================

export const SLACK_BOT_TOOL_NAME = "slack_bot" as const;

// =============================================================================
// Tool Schemas - Input schemas for each tool
// =============================================================================

export const postMessageSchema = {
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
};

export const listUsersSchema = {
  nameFilter: z
    .string()
    .optional()
    .describe("The name of the user to filter by (optional)"),
};

export const getUserSchema = {
  userId: z
    .string()
    .describe("The Slack user ID to look up (for example: U0123456789)."),
};

export const listPublicChannelsSchema = {
  nameFilter: z
    .string()
    .optional()
    .describe("The name of the channel to filter by (optional)"),
};

export const readChannelHistorySchema = {
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
};

export const readThreadMessagesSchema = {
  channel: z.string().describe("Channel name or ID"),
  threadTs: z.string().describe("Thread timestamp (ts of the parent message)"),
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
};

export const addReactionSchema = {
  channel: z.string().describe("The channel where the message is located"),
  timestamp: z.string().describe("The timestamp of the message to react to"),
  name: z
    .string()
    .describe(
      "The name of the emoji reaction (without colons, e.g., 'thumbsup', 'heart')"
    ),
};

export const removeReactionSchema = {
  channel: z.string().describe("The channel where the message is located"),
  timestamp: z
    .string()
    .describe("The timestamp of the message to remove reaction from"),
  name: z
    .string()
    .describe(
      "The name of the emoji reaction to remove (without colons, e.g., 'thumbsup', 'heart')"
    ),
};

// =============================================================================
// Tool Definitions - Static tool metadata for constants registry
// =============================================================================

export const SLACK_BOT_TOOLS: MCPToolType[] = [
  {
    name: "post_message",
    description:
      "Post a message to a Slack channel. The slack bot must be added to the channel before it can post messages. Direct messages are not supported. You MUST ONLY post to channels that were explicitly specified by the user in their request. NEVER post to alternative channels if the requested channel is not found. If you cannot find the exact channel requested by the user, you MUST ask the user for clarification instead of choosing a different channel.",
    inputSchema: zodToJsonSchema(z.object(postMessageSchema)) as JSONSchema7,
  },
  {
    name: "list_users",
    description: "List all users in the workspace",
    inputSchema: zodToJsonSchema(z.object(listUsersSchema)) as JSONSchema7,
  },
  {
    name: "get_user",
    description:
      "Get user information given a Slack user ID. Use this to retrieve details about a user when you have their user ID.",
    inputSchema: zodToJsonSchema(z.object(getUserSchema)) as JSONSchema7,
  },
  {
    name: "list_public_channels",
    description: "List all public channels in the workspace",
    inputSchema: zodToJsonSchema(
      z.object(listPublicChannelsSchema)
    ) as JSONSchema7,
  },
  {
    name: "read_channel_history",
    description:
      "Read messages from a specific channel with pagination support. The slack bot must be added to the channel before it can read messages.",
    inputSchema: zodToJsonSchema(
      z.object(readChannelHistorySchema)
    ) as JSONSchema7,
  },
  {
    name: "read_thread_messages",
    description:
      "Read all messages in a specific thread with pagination support",
    inputSchema: zodToJsonSchema(
      z.object(readThreadMessagesSchema)
    ) as JSONSchema7,
  },
  {
    name: "add_reaction",
    description: "Add a reaction emoji to a message",
    inputSchema: zodToJsonSchema(z.object(addReactionSchema)) as JSONSchema7,
  },
  {
    name: "remove_reaction",
    description: "Remove a reaction emoji from a message",
    inputSchema: zodToJsonSchema(z.object(removeReactionSchema)) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SLACK_BOT_SERVER_INFO = {
  name: "slack_bot" as const,
  version: "1.0.0",
  description:
    "Specialized Slack bot integration for posting messages as the workspace bot. Limited to channels where the bot has been added.",
  authorization: {
    provider: "slack" as const,
    supported_use_cases: ["platform_actions"] as MCPOAuthUseCase[],
  },
  icon: "SlackLogo" as const,
  documentationUrl: null,
  instructions:
    "The Slack bot must be explicitly added to a channel before it can post messages or read history. " +
    "Direct messages and search operations are not supported. " +
    "When posting a message on Slack, you MUST use Slack-flavored Markdown to format the message. " +
    "IMPORTANT: if you want to mention a user, you must use <@USER_ID> where USER_ID is the id of the user you want to mention.\n" +
    "If you want to reference a channel, you must use #CHANNEL where CHANNEL is the channel name, or <#CHANNEL_ID> where CHANNEL_ID is the channel ID.",
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const SLACK_BOT_TOOL_STAKES = {
  list_public_channels: "never_ask",
  list_users: "never_ask",
  get_user: "never_ask",
  read_channel_history: "never_ask",
  read_thread_messages: "never_ask",
  post_message: "low",
  add_reaction: "low",
  remove_reaction: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;

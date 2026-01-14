import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const MICROSOFT_TEAMS_TOOL_NAME = "microsoft_teams" as const;

export const searchMessagesContentSchema = {
  query: z
    .string()
    .describe("Search query to find relevant messages in Teams."),
};

export const listTeamsSchema = {};

export const listUsersSchema = {
  nameFilter: z
    .string()
    .optional()
    .describe("The name of the user to filter by (optional)"),
  limit: z
    .number()
    .optional()
    .default(25)
    .describe("Maximum number of users to return (default: 25, max: 25)."),
};

export const listChannelsSchema = {
  teamId: z
    .string()
    .describe(
      "The ID of the team to list channels from. Use list_teams to get team IDs."
    ),
  nameFilter: z
    .string()
    .optional()
    .describe("Filter channels by name (optional, searches display name)."),
};

export const listChatsSchema = {
  limit: z
    .number()
    .optional()
    .default(50)
    .describe("Maximum number of chats to return (default: 50, max: 50)."),
  chatType: z
    .enum(["oneOnOne", "group", "meeting"])
    .optional()
    .describe(
      "Filter chats by type: 'oneOnOne' for direct messages, 'group' for group chats, 'meeting' for meeting chats."
    ),
  nameFilter: z
    .string()
    .optional()
    .describe(
      "Filter chats by topic name (optional, searches chat topic for group chats)."
    ),
};

export const listMessagesSchema = {
  teamId: z.string().describe("The ID of the team containing the channel."),
  channelId: z.string().describe("The ID of the channel to list threads from."),
  fromDate: z
    .string()
    .optional()
    .describe(
      "ISO 8601 date string (e.g., '2024-01-01T00:00:00Z'). Only retrieve messages modified after this date."
    ),
  toDate: z
    .string()
    .optional()
    .describe(
      "ISO 8601 date string (e.g., '2024-12-31T23:59:59Z'). Only retrieve messages modified before this date. Defaults to current time."
    ),
};

export const postMessageSchema = {
  messageContent: z
    .string()
    .describe("The content of the message to post (supports HTML formatting)."),
  targetType: z
    .enum(["channel", "chat"])
    .describe(
      "The type of target to post to: 'channel' for team channels, 'chat' for direct/group chats."
    ),
  teamId: z
    .string()
    .optional()
    .describe("The ID of the team (required when targetType is 'channel')."),
  channelId: z
    .string()
    .optional()
    .describe("The ID of the channel (required when targetType is 'channel')."),
  chatId: z
    .string()
    .optional()
    .describe(
      "The ID of the chat (required when targetType is 'chat', unless userIds is provided)."
    ),
  userIds: z
    .array(z.string())
    .optional()
    .describe(
      "Array of user IDs to send a message to (optional, only for targetType 'chat'). If 1 user ID is provided, a one-on-one chat will be created/used. If multiple user IDs are provided, a group chat will be created. Cannot be used together with chatId."
    ),
  parentMessageId: z
    .string()
    .optional()
    .describe(
      "The ID of the parent message to reply to (optional, creates a threaded reply). Only supported for channels."
    ),
};

export const MICROSOFT_TEAMS_TOOLS: MCPToolType[] = [
  {
    name: "search_messages_content",
    description:
      "Search for messages contentin Microsoft Teams chats and channels. Returns the results in relevance order.",
    inputSchema: zodToJsonSchema(
      z.object(searchMessagesContentSchema)
    ) as JSONSchema,
  },
  {
    name: "list_teams",
    description:
      "List all Teams that the authenticated user has joined. Returns team details including name, description, and team ID.",
    inputSchema: zodToJsonSchema(z.object(listTeamsSchema)) as JSONSchema,
  },
  {
    name: "list_users",
    description:
      "List all users in the organization. Returns user details including display name, email, and user ID.",
    inputSchema: zodToJsonSchema(z.object(listUsersSchema)) as JSONSchema,
  },
  {
    name: "list_channels",
    description:
      "List all channels in a specific team. Returns channel details including name, description, and channel ID. Can be filtered by channel name.",
    inputSchema: zodToJsonSchema(z.object(listChannelsSchema)) as JSONSchema,
  },
  {
    name: "list_chats",
    description:
      "List all chats (one-on-one or group chats) for the authenticated user. Returns chat details including chat ID, topic, and participants. Can be filtered by chat type and chat topic.",
    inputSchema: zodToJsonSchema(z.object(listChatsSchema)) as JSONSchema,
  },
  {
    name: "list_messages",
    description:
      "List all messages (and their replies) in a specific channel. Returns thread messages with their replies. Supports pagination to retrieve all results and filtering by date range.",
    inputSchema: zodToJsonSchema(z.object(listMessagesSchema)) as JSONSchema,
  },
  {
    name: "post_message",
    description:
      "Post a message to a Teams channel, chat, or as a reply in a thread. Can send messages to channels, direct chats, or as threaded replies. For direct messages, you can provide userIds instead of chatId to automatically create a chat if it doesn't exist (one-on-one for 1 user, group chat for multiple users). By default (it no chat, channel or users are provided), the message will be sent to the current user's self-chat.",
    inputSchema: zodToJsonSchema(z.object(postMessageSchema)) as JSONSchema,
  },
];

export const MICROSOFT_TEAMS_SERVER_INFO = {
  name: "microsoft_teams" as const,
  version: "1.0.0",
  description: "Microsoft Teams for searching and posting messages.",
  authorization: {
    provider: "microsoft_tools" as const,
    supported_use_cases: ["personal_actions"] as MCPOAuthUseCase[],
    scope:
      "User.Read User.ReadBasic.All Team.ReadBasic.All Channel.ReadBasic.All Chat.Read Chat.ReadWrite ChatMessage.Read ChatMessage.Send ChannelMessage.Read.All ChannelMessage.Send offline_access" as const,
  },
  icon: "MicrosoftTeamsLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/microsoft-teams-tool-setup",
  instructions: null,
};

export const MICROSOFT_TEAMS_TOOL_STAKES = {
  search_messages_content: "never_ask",
  list_teams: "never_ask",
  list_users: "never_ask",
  list_channels: "never_ask",
  list_chats: "never_ask",
  list_messages: "never_ask",
  post_message: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;

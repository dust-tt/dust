import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const MICROSOFT_TEAMS_SERVER_NAME = "microsoft_teams" as const;

export const MICROSOFT_TEAMS_TOOLS_METADATA = createToolsRecord({
  search_messages_content: {
    description:
      "Search for messages contentin Microsoft Teams chats and channels. Returns the results in relevance order.",
    schema: {
      query: z
        .string()
        .describe("Search query to find relevant messages in Teams."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Teams messages",
      done: "Search Teams messages",
    },
  },
  list_teams: {
    description:
      "List all Teams that the authenticated user has joined. Returns team details including name, description, and team ID.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Teams teams",
      done: "List Teams teams",
    },
  },
  list_users: {
    description:
      "List all users in the organization. Returns user details including display name, email, and user ID.",
    schema: {
      nameFilter: z
        .string()
        .optional()
        .describe("The name of the user to filter by (optional)"),
      limit: z
        .number()
        .optional()
        .default(25)
        .describe("Maximum number of users to return (default: 25, max: 25)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Teams users",
      done: "List Teams users",
    },
  },
  list_channels: {
    description:
      "List all channels in a specific team. Returns channel details including name, description, and channel ID. Can be filtered by channel name.",
    schema: {
      teamId: z
        .string()
        .describe(
          "The ID of the team to list channels from. Use list_teams to get team IDs."
        ),
      nameFilter: z
        .string()
        .optional()
        .describe("Filter channels by name (optional, searches display name)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Teams channels",
      done: "List Teams channels",
    },
  },
  list_chats: {
    description:
      "List all chats (one-on-one or group chats) for the authenticated user. Returns chat details including chat ID, topic, and participants. Can be filtered by chat type and chat topic.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Teams chats",
      done: "List Teams chats",
    },
  },
  list_messages: {
    description:
      "List all messages (and their replies) in a specific channel. Returns thread messages with their replies. Supports pagination to retrieve all results and filtering by date range.",
    schema: {
      teamId: z.string().describe("The ID of the team containing the channel."),
      channelId: z
        .string()
        .describe("The ID of the channel to list threads from."),
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Teams messages",
      done: "List Teams messages",
    },
  },
  post_message: {
    description:
      "Post a message to a Teams channel, chat, or as a reply in a thread. Can send messages to channels, direct chats, or as threaded replies. For direct messages, you can provide userIds instead of chatId to automatically create a chat if it doesn't exist (one-on-one for 1 user, group chat for multiple users). By default (it no chat, channel or users are provided), the message will be sent to the current user's self-chat.",
    schema: {
      messageContent: z
        .string()
        .describe(
          "The content of the message to post (supports HTML formatting)."
        ),
      targetType: z
        .enum(["channel", "chat"])
        .describe(
          "The type of target to post to: 'channel' for team channels, 'chat' for direct/group chats."
        ),
      teamId: z
        .string()
        .optional()
        .describe(
          "The ID of the team (required when targetType is 'channel')."
        ),
      channelId: z
        .string()
        .optional()
        .describe(
          "The ID of the channel (required when targetType is 'channel')."
        ),
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
    },
    stake: "medium",
    displayLabels: {
      running: "Posting Teams message",
      done: "Post Teams message",
    },
  },
});

export const MICROSOFT_TEAMS_SERVER = {
  serverInfo: {
    name: MICROSOFT_TEAMS_SERVER_NAME,
    version: "1.0.0",
    description: "Microsoft Teams for searching and posting messages.",
    icon: "MicrosoftTeamsLogo",
    authorization: {
      provider: "microsoft",
      supported_use_cases: ["personal_actions"],
    },
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(MICROSOFT_TEAMS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(MICROSOFT_TEAMS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_CONVERSATION_SERVER_NAME = "project_conversation" as const;

export const PROJECT_CONVERSATION_TOOLS_METADATA = createToolsRecord({
  create_conversation: {
    description:
      "Create a new conversation in the project and post a user message. The message will be sent on behalf of the user executing the tool.",
    schema: {
      message: z
        .string()
        .describe("The message content to post in the new conversation"),
      title: z.string().describe("Title for the conversation"),
      agentId: z
        .string()
        .optional()
        .describe("Optional agent ID to mention in the conversation"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Creating conversation",
      done: "Create conversation",
    },
  },
  list_conversations: {
    description:
      "List conversations in the project updated on or after a given time (updatedSince). " +
      "Use unreadOnly=true to return only conversations with unread messages (same as narrowing unread), " +
      "or false to include all that match the time filter. " +
      "When unreadOnly is false, results are paginated: pass pageCursor from nextPageCursor of the previous response to fetch the next page (efficient, one DB page per call). " +
      "When unreadOnly is true, pagination cursors are not used; the tool scans conversations in the window up to the requested limit. " +
      "By default, only conversation metadata is returned (no message bodies). Set includeMessages=true to load and format all messages (much heavier).",
    schema: {
      unreadOnly: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, only conversations the user has not fully read. If false, all conversations matching updatedSince."
        ),
      updatedSince: z
        .number()
        .optional()
        .describe(
          "Unix timestamp in milliseconds; only conversations whose updated time is >= this value. If omitted, defaults to approximately 30 days before the tool runs."
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe(
          "Maximum number of conversations to return per call (default: 20, max: 100)"
        ),
      pageCursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor from nextPageCursor of a prior list_conversations call. Only for unreadOnly=false."
        ),
      includeMessages: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, fetch each conversation with messages and return formatted transcript text. If false (default), return metadata only (no getLightConversation calls)."
        ),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing project conversations",
      done: "List conversations",
    },
  },
  search_conversations: {
    description:
      "Semantic search over messages in this project's conversations. Returns the most relevant conversations for the given query.",
    schema: {
      query: z.string().min(1).describe("Natural-language search query"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of results (default: 10, max: 100)"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching project conversations",
      done: "Search conversations",
    },
  },
  add_message_to_conversation: {
    description:
      "Post a user message to an existing conversation in this project. The message is sent on behalf of the user executing the tool. " +
      "The conversation must belong to the same project. If conversationId is omitted, the current agent conversation is used (when available).",
    schema: {
      conversationId: z
        .string()
        .optional()
        .describe(
          "Conversation sId to post to; defaults to the conversation this agent run is in when omitted"
        ),
      message: z.string().describe("The message content to post"),
      agentId: z
        .string()
        .optional()
        .describe("Optional agent ID to mention in the message"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Adding message to conversation",
      done: "Add message to conversation",
    },
  },
});

const PROJECT_CONVERSATION_INSTRUCTIONS =
  "Create conversations, list or search conversations, and post messages within a project. " +
  "Listing and search require read access; creating conversations and adding messages require write access on the project space.";

export const PROJECT_CONVERSATION_SERVER = {
  // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
  serverInfo: {
    name: "project_conversation",
    version: "1.0.0",
    description:
      "Create and manage conversations within projects. Post messages to new conversations on behalf of users.",
    icon: "ActionMegaphoneIcon",
    authorization: null,
    documentationUrl: null,
    instructions: PROJECT_CONVERSATION_INSTRUCTIONS,
  },
  tools: Object.values(PROJECT_CONVERSATION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_CONVERSATION_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

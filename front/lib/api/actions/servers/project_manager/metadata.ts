import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  SearchWithNodesInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_MANAGER_SERVER_NAME = "project_manager" as const;

export const PROJECT_MANAGER_TOOLS_METADATA = createToolsRecord({
  add_file: {
    description:
      "Add a new file to the project context. The file will be available to all conversations in this project. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    schema: {
      fileName: z.string().describe("Name of the file to add"),
      content: z
        .string()
        .optional()
        .describe(
          "Text content of the file (provide either this or sourceFileId)"
        ),
      sourceFileId: z
        .string()
        .optional()
        .describe(
          "ID of an existing file to copy content from (provide either this or content)"
        ),
      contentType: z
        .string()
        .optional()
        .describe(
          "MIME type (default: inferred from file extension, e.g. text/markdown for .md files, or text/plain if unknown. Inherited from sourceFileId if provided)"
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to add the file to, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Adding file to project",
      done: "Add file to project",
    },
  },
  add_content_node: {
    description:
      "Add a content node reference from Company Data to the project context. The node will be available to all conversations in this project.",
    schema: {
      title: z.string().describe("Display title for the content node"),
      dataSourceNodeId: z
        .string()
        .startsWith(DATA_SOURCE_NODE_ID)
        .describe("Internal data source node ID to attach"),
      nodeId: z.string().describe("Internal node ID to attach"),
      url: z.string().nullable().optional().describe("Optional source URL"),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to add the content node to, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Adding content node to project",
      done: "Add content node to project",
    },
  },
  update_file: {
    description:
      "Update the content of an existing file in the project context. This replaces the entire file content. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    schema: {
      fileId: z.string().describe("ID of the file to update"),
      content: z
        .string()
        .optional()
        .describe(
          "New text content for the file (provide either this or sourceFileId)"
        ),
      sourceFileId: z
        .string()
        .optional()
        .describe(
          "ID of an existing file to copy content from (provide either this or content)"
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to update the file in, will fallback to the conversation's project."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating file in project",
      done: "Update file in project",
    },
  },
  remove_file: {
    description:
      "Remove an existing file from the project context. The file will no longer be available to conversations in this project. " +
      "Deletes the underlying file (cannot be undone). Use file IDs from get_information like other project context files.",
    schema: {
      fileId: z
        .string()
        .describe("ID of an existing file in the project context to remove"),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to remove the file from, will fallback to the conversation's project."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Removing file from project",
      done: "Remove file from project",
    },
  },
  remove_content_node: {
    description:
      "Remove a content node reference from the project context. The node will no longer be available to conversations in this project. " +
      "Use nodeId with nodeDataSourceViewId from get_information attachments for this reference.",
    schema: {
      nodeId: z.string().describe("Internal node ID to remove"),
      nodeDataSourceViewId: z
        .string()
        .describe(
          "Internal data source view ID for the content node reference (from get_information attachments)"
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to remove the content node from, will fallback to the conversation's project."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Removing content node from project",
      done: "Remove content node from project",
    },
  },
  attach_to_conversation: {
    description:
      "Attach an existing project context file to the current conversation without creating or copying a new file.",
    schema: {
      fileId: z
        .string()
        .describe("ID of an existing file in the project context to attach"),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to attach the file to, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Attaching project file to conversation",
      done: "Attach project file to conversation",
    },
  },
  edit_description: {
    description:
      "Edit the project description. Only plain text is accepted (no markdown, HTML, or formatting). Descriptions should be brief and concise.",
    schema: {
      description: z
        .string()
        .describe(
          "New project description. Must be plain text only (no markdown, HTML, or other formatting). Keep it brief and concise: 1-2 short sentences max."
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to edit the description of, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Editing project description",
      done: "Edit project description",
    },
  },
  get_information: {
    description:
      "Get comprehensive information about the project context, including project URL, description, file count, and file list.",
    schema: {
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to get information from, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting project information",
      done: "Get project information",
    },
  },
  list_members: {
    description:
      "List members of the project. Each entry includes user ID, name, email and status within the project.",
    schema: {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe(
          "Maximum number of members to return per call (default: 20, max: 100)"
        ),
      pageCursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor from nextPageCursor of a prior list_members call. Only for pagination."
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to list members of, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing project members",
      done: "List project members",
    },
  },
  list_projects: {
    description:
      "List non-archived projects where you are a space member (same scope as the workspace project sidebar source). Each entry includes spaceId, name, and dustProject (uri + mimeType) to pass as the dustProject argument to other project_manager tools.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing projects",
      done: "List projects",
    },
  },
  create_project: {
    description:
      "Create a new project. By default the project is private. You can optionally set visibility to open and add members by user sId.",
    schema: {
      title: z.string().describe("Project title"),
      description: z
        .string()
        .optional()
        .describe("Optional project description (plain text recommended)"),
      visibility: z
        .enum(["private", "open"])
        .optional()
        .default("private")
        .describe(
          "Project visibility. Defaults to private. Open projects are subject to workspace policy."
        ),
      memberIds: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of user ids to add as project members after project creation."
        ),
      seedInitialTodos: z
        .boolean()
        .optional()
        .describe(
          "Whether to seed the project with a set of starter todos. Defaults to false when creating via the tool."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating project",
      done: "Create project",
    },
  },
  retrieve_recent_documents: {
    description:
      "Fetch the most recent documents from this project's knowledge data source and from any content nodes linked in the project context, in reverse chronological order up to the retrieval limit. Respects optional time window. Optionally restrict to subtrees using nodeIds.",
    schema: {
      timeFrame: IncludeInputSchema.shape.timeFrame,
      nodeIds: SearchWithNodesInputSchema.shape.nodeIds,
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving recent project documents",
      done: "Retrieve recent project documents",
    },
  },
  semantic_search: {
    description:
      "Semantic search over this project using the same retrieval pipeline as company data search. Scope selects the project dust_project data source slice (knowledge vs conversation transcripts vs both) plus searchable context nodes for knowledge/all. Optionally restrict to subtrees using nodeIds (same as company data_sources_file_system search).",
    schema: {
      query: z
        .string()
        .describe(
          "Natural-language query; include enough context from the conversation for good retrieval."
        ),
      searchScope: z
        .enum(["knowledge", "conversations", "all"])
        .optional()
        .describe(
          "knowledge: project files, metadata, and linked searchable nodes (excludes conversation transcripts in the project data source); conversations: only those transcripts; all: entire project data source plus linked nodes (default when omitted)."
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .optional()
        .describe(
          "Restrict matches by document time (same as company search): `all`, or `{k}h|d|w|m|y`. Omit for all time."
        ),
      nodeIds: SearchWithNodesInputSchema.shape.nodeIds,
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching project",
      done: "Search project",
    },
  },

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
    stake: "medium",
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
    stake: "medium",
    displayLabels: {
      running: "Adding message to conversation",
      done: "Add message to conversation",
    },
  },
});

const PROJECT_MANAGER_INSTRUCTIONS =
  "Project files and metadata are shared across all conversations in this project. " +
  "You can add all sorts of files but only text-based files are supported for updating. " +
  "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated). " +
  "You can remove a file from the project context (remove_file) or remove a content node reference from Company Data (remove_content_node). " +
  "You can also attach an existing project context file to the current conversation without recreating it. " +
  "Use list_projects to discover projects you can access and obtain the dustProject uri for other tools. " +
  "Use semantic_search to find relevant chunks in project knowledge and/or conversations (scope: knowledge, conversations, or all). " +
  "Use retrieve_recent_documents to load recent content from the project data source and from knowledge nodes in the project context. " +
  "Requires write permissions on the project space. " +
  "After adding or updating files, always list the file names you changed in your response so the user knows exactly what was modified.";

export const PROJECT_MANAGER_SERVER = {
  // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
  serverInfo: {
    name: "project_manager",
    version: "1.0.0",
    description:
      "Manage project files and metadata. Add, update, or remove files in the project context and content node references from Company Data, list files, and organize project resources.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
    instructions: PROJECT_MANAGER_INSTRUCTIONS,
  },
  tools: Object.values(PROJECT_MANAGER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_MANAGER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

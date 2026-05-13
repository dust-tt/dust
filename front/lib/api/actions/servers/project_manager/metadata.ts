import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  SearchWithNodesInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_MANAGER_SERVER_NAME = "project_manager" as const;

export const PROJECT_MANAGER_TOOLS_METADATA = createToolsRecord({
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
      "Get information about the project: URL, description, and linked content nodes " +
      "attached to the project context. Does NOT list project files. Project files live under " +
      `\`project/<rel>\` scoped paths and are discovered through the \`${FILES_SERVER_NAME}\` MCP server.`,
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
      seedInitialTasks: z
        .boolean()
        .optional()
        .describe(
          "Whether to seed the project with a set of starter tasks. Defaults to false when creating via the tool."
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
  create_conversation: {
    description:
      "Create a new conversation in the project and post a user message. Default: always pass an agentName to delegate the task to an agent running inside the project. Do NOT do the work yourself. If work needs to be done, delegate it via agentName. Omit agentName only when posting a simple message that requires no intellectual work (e.g. a status update, a comment, a note) or when explicitly asked to post the final output.",
    schema: {
      message: z
        .string()
        .describe(
          "When agentName is provided: the raw task description and context for the agent to act on. When agentName is omitted: the complete finished output to deposit as-is."
        ),
      title: z.string().describe("Title for the conversation"),
      agentName: z
        .string()
        .optional()
        .describe(
          "The name of the agent to trigger in the new conversation. The tool searches matching agent configurations and uses the best match. Use this whenever the user asks for work to be done in a project (research, analysis, drafting, etc.). When omitted, no agent is triggered and the message is posted as a static result. Use this only to deposit a finished artifact you have already fully produced."
        ),
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
      "Post a user message to an existing conversation in this project. Default: always pass an agentName to delegate the task to an agent running inside the conversation. Do NOT do the work yourself. If work needs to be done, delegate it via agentName. Omit agentName only when posting a simple message that requires no intellectual work (e.g. a status update, a comment, a note) or when explicitly asked to post the final output." +
      "The conversation must belong to the same project. If conversationId is omitted, the current agent conversation is used (when available).",
    schema: {
      conversationId: z
        .string()
        .optional()
        .describe(
          "Conversation sId to post to; defaults to the conversation this agent run is in when omitted"
        ),
      message: z
        .string()
        .describe(
          "When agentName is provided: the raw task description and context for the agent to act on. When agentName is omitted: the complete finished output to deposit as-is."
        ),
      agentName: z
        .string()
        .optional()
        .describe(
          "The name of the agent to trigger in the conversation. The tool searches matching agent configurations and uses the best match. Use this whenever the user asks for work to be done in a project (research, analysis, drafting, etc.). When omitted, no agent is triggered and the message is posted as a static result. Use this only to deposit a finished artifact you have already fully produced."
        ),
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
  `Project files are managed through the \`${FILES_SERVER_NAME}\` MCP server using \`project/<rel>\` scoped paths ` +
  "(create, cat, grep, list, delete), not through this server. " +
  "Use `add_content_node` to reference a Company Data node in the project context, and " +
  "`remove_content_node` to remove such a reference. " +
  "Use `list_projects` to discover projects you can access and obtain the dustProject uri for other tools. " +
  "Use `retrieve_recent_documents` to load recent content from the project data source and from " +
  "knowledge nodes in the project context. " +
  "Requires write permissions on the project space for state-changing operations.";

export const PROJECT_MANAGER_SERVER = {
  // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
  serverInfo: {
    name: "project_manager",
    version: "1.0.0",
    description:
      "Manage project metadata, members, conversations, and Company Data references. " +
      `Raw project file operations (create, read, search, write, delete) live in the \`${FILES_SERVER_NAME}\` MCP ` +
      "server under `project/<rel>` scoped paths.",
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

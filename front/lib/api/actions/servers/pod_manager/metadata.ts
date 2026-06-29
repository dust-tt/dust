import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  SearchWithNodesInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import {
  PodMembersToAddSchema,
  PodMembersToRemoveSchema,
} from "@app/lib/api/actions/servers/pod_manager/types";
import { SCOPED_PREFIX_POD } from "@app/lib/api/file_system/types";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POD_MANAGER_SERVER_NAME = "pod_manager" as const;
export const UPDATE_MEMBERS_TOOL_NAME = "update_members" as const;
export const LIST_MEMBERS_TOOL_NAME = "list_members" as const;
export const SEMANTIC_SEARCH_TOOL_NAME = "semantic_search" as const;

export const POD_MANAGER_TOOLS_METADATA = createToolsRecord({
  add_content_node: {
    description:
      "Add a content node reference from Company Data to the Pod context. The node will be available to all conversations in this Pod.",
    schema: {
      title: z.string().describe("Display title for the content node"),
      dataSourceNodeId: z
        .string()
        .startsWith(DATA_SOURCE_NODE_ID)
        .describe("Internal data source node ID to attach"),
      nodeId: z.string().describe("Internal node ID to attach"),
      url: z.string().nullable().optional().describe("Optional source URL"),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to add the content node to, will fallback to the conversation's Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Adding content node to Pod",
      done: "Add content node to Pod",
    },
  },
  remove_content_node: {
    description:
      "Remove a content node reference from the Pod context. The node will no longer be available to conversations in this Pod. " +
      "Use nodeId with nodeDataSourceViewId from get_information attachments for this reference.",
    schema: {
      nodeId: z.string().describe("Internal node ID to remove"),
      nodeDataSourceViewId: z
        .string()
        .describe(
          "Internal data source view ID for the content node reference (from get_information attachments)"
        ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to remove the content node from, will fallback to the conversation's Pod."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Removing content node from Pod",
      done: "Remove content node from Pod",
    },
  },
  edit_information: {
    description:
      "Edit Pod information: title, description, and/or pinned frame. " +
      "Provide at least one field to update. Descriptions must be plain text only (no markdown, HTML, or formatting). " +
      "The pinned frame must be an existing Pod file path under `pod/` (use null to unpin).",
    schema: {
      title: z.string().optional().describe("New Pod title"),
      description: z
        .string()
        .optional()
        .describe(
          "New Pod description. Must be plain text only (no markdown, HTML, or other formatting). Keep it brief and concise: 1-2 short sentences max."
        ),
      pinnedFramePath: z
        .string()
        .nullable()
        .optional()
        .describe(
          `Path to a Pod file to pin as the Pod banner frame (e.g. ${SCOPED_PREFIX_POD}<id>/banner.html). Pass null to unpin.`
        ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to edit, will fallback to the conversation's Pod."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Editing Pod information",
      done: "Edit Pod information",
    },
  },
  [UPDATE_MEMBERS_TOOL_NAME]: {
    description:
      "Add or remove Pod members and editors by user id. Requires Pod editor permissions. " +
      "Editors and members are mutually exclusive: adding an editor removes them from members, " +
      "and adding a member is a no-op if the user is already an editor.",
    schema: {
      membersToAdd: PodMembersToAddSchema.optional().describe(
        "User ids to add mapped to their Pod role (member or editor)."
      ),
      membersToRemove: PodMembersToRemoveSchema.optional().describe(
        "User ids to remove from the Pod (membership or editorship)."
      ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to update members for, will fallback to the conversation's Pod."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Pod members",
      done: "Update Pod members",
    },
  },
  get_information: {
    description:
      "Get information about the Pod: URL, title, description, pinned frame, and linked content nodes " +
      "attached to the Pod context. Does NOT list Pod files. Pod files live under " +
      `\`${SCOPED_PREFIX_POD}<id>/<rel>\` scoped paths and are discovered through the \`${FILES_SERVER_NAME}\` MCP server. ` +
      "Pod files, metadata, and members are shared state across all conversations in this Pod.",
    schema: {
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to get information from, will fallback to the conversation's Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Pod information",
      done: "Get Pod information",
    },
  },
  [LIST_MEMBERS_TOOL_NAME]: {
    description:
      "List members of the Pod. Each entry includes user ID, name, email and status within the Pod.",
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
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to list members of, will fallback to the conversation's Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Pod members",
      done: "List Pod members",
    },
  },
  list_pods: {
    description:
      "List non-archived Pods. Defaults to Pods where you are a member (access='member'). " +
      "Use access='open' to list all open Pods in the workspace. " +
      "Each entry includes id, name, and dustPod (uri + mimeType) to pass as the dustPod argument to other pod_manager tools.",
    schema: {
      access: z
        .enum(["member", "open"])
        .default("member")
        .optional()
        .describe(
          "Pod access filter: member = Pods you belong to (default); open = all open Pods in the workspace."
        ),
      q: z
        .string()
        .optional()
        .describe("Optional case-insensitive substring filter on Pod name."),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe(
          "Maximum number of Pods to return per call (default: 20, max: 100)."
        ),
      pageCursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor from nextPageCursor of a prior list_pods call. Only for pagination."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Pods",
      done: "List Pods",
    },
  },
  create_pod: {
    description:
      "Create a new Pod. By default the Pod is private. The creator is always added as a Pod editor. " +
      "You can optionally set visibility to open and add initial members or editors via membersToAdd.",
    schema: {
      title: z.string().describe("Pod title"),
      description: z
        .string()
        .optional()
        .describe("Optional Pod description (plain text recommended)"),
      visibility: z
        .enum(["private", "open"])
        .optional()
        .default("private")
        .describe(
          "Pod visibility. Defaults to private. Open Pods are subject to workspace policy."
        ),
      membersToAdd: PodMembersToAddSchema.optional().describe(
        "Optional user ids to add after creation mapped to their Pod role (member or editor). The creator is always an editor."
      ),
      seedInitialTasks: z
        .boolean()
        .optional()
        .describe(
          "Whether to seed the Pod with a set of starter tasks after creation. Defaults to false."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Pod",
      done: "Create Pod",
    },
  },
  retrieve_recent_documents: {
    description:
      "Fetch the most recent documents from this Pod's knowledge data source and from any content nodes linked in the Pod context, in reverse chronological order up to the retrieval limit. Respects optional time window. Optionally restrict to subtrees using nodeIds.",
    schema: {
      timeFrame: IncludeInputSchema.shape.timeFrame,
      nodeIds: SearchWithNodesInputSchema.shape.nodeIds,
      dustPod:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving recent Pod documents",
      done: "Retrieve recent Pod documents",
    },
  },
  [SEMANTIC_SEARCH_TOOL_NAME]: {
    description:
      "Semantic search over a Pod using the same retrieval pipeline as company data search. Scope selects the Pod data source slice (files vs conversation transcripts vs both) plus searchable context nodes for files/all.",
    schema: {
      query: z
        .string()
        .describe(
          "Natural-language query; include enough context from the conversation for good retrieval."
        ),
      searchScope: z
        .enum(["files", "conversations", "all"])
        .optional()
        .describe(
          "files: Pod files, metadata, and linked searchable nodes (excludes conversation transcripts in the Pod data source); conversations: only those transcripts; all: entire Pod data source plus linked nodes (default when omitted)."
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .optional()
        .describe(
          "Restrict matches by document time (same as company search): `all`, or `{k}h|d|w|m|y`. Omit for all time."
        ),
      nodeIds: SearchWithNodesInputSchema.shape.nodeIds,
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to search, will fallback to the conversation's Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Pod",
      done: "Search Pod",
    },
  },
  create_conversation: {
    description:
      "Create a new conversation in the Pod and post a user message. Default: always pass an agentName to delegate the task to an agent running inside the Pod. Do NOT do the work yourself. If work needs to be done, delegate it via agentName. Omit agentName only when posting a simple message that requires no intellectual work (e.g. a status update, a comment, a note) or when explicitly asked to post the final output.",
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
          "The name of the agent to trigger in the new conversation. The tool searches matching agent configurations and uses the best match. Use this whenever the user asks for work to be done in a Pod (research, analysis, drafting, etc.). When omitted, no agent is triggered and the message is posted as a static result. Use this only to deposit a finished artifact you have already fully produced."
        ),
      dustPod:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
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
      "List conversations in the Pod updated on or after a given time (updatedSince). " +
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
      dustPod:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Pod conversations",
      done: "List conversations",
    },
  },
  add_message_to_conversation: {
    description:
      "Post a user message to an existing conversation in this Pod. Default: always pass an agentName to delegate the task to an agent running inside the conversation. Do NOT do the work yourself. If work needs to be done, delegate it via agentName. Omit agentName only when posting a simple message that requires no intellectual work (e.g. a status update, a comment, a note) or when explicitly asked to post the final output." +
      "The conversation must belong to the same Pod. If conversationId is omitted, the current agent conversation is used (when available).",
    schema: {
      conversationId: z
        .string()
        .optional()
        .describe(
          "Conversation id to post to; defaults to the conversation this agent run is in when omitted"
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
          "The name of the agent to trigger in the conversation. The tool searches matching agent configurations and uses the best match. Use this whenever the user asks for work to be done in a Pod (research, analysis, drafting, etc.). When omitted, no agent is triggered and the message is posted as a static result. Use this only to deposit a finished artifact you have already fully produced."
        ),
      dustPod:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
        ].optional(),
    },
    stake: "medium",
    displayLabels: {
      running: "Adding message to conversation",
      done: "Add message to conversation",
    },
  },
});

export const POD_MANAGER_SERVER = {
  serverInfo: {
    name: "pod_manager",
    version: "1.0.0",
    description:
      "Manage Pod metadata, members, conversations, and Company Data references. " +
      `Raw Pod file operations (create, read, search, write, delete) live in the \`${FILES_SERVER_NAME}\` MCP ` +
      `server under \`${SCOPED_PREFIX_POD}<id>/<rel>\` scoped paths.`,
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(POD_MANAGER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POD_MANAGER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

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
export const EDIT_INFORMATION_TOOL_NAME = "edit_information" as const;
export const MOVE_CONVERSATION_TOOL_NAME = "move_conversation" as const;

export const POD_MANAGER_TOOLS_METADATA = createToolsRecord({
  add_content_node: {
    description:
      "Reference an existing Company Data node in a specific Pod's shared context.",
    schema: {
      title: z.string().describe("Title for the content node"),
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Adding content node to Pod",
      done: "Add content node to Pod",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  remove_content_node: {
    description:
      "Detach a Company Data node from a Pod. Use IDs returned by get_information.",
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "low",
    displayLabels: {
      running: "Removing content node from Pod",
      done: "Remove content node from Pod",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  [EDIT_INFORMATION_TOOL_NAME]: {
    description:
      "Change an existing Pod: make it open to the workspace or restricted, rename it, edit its plain-text description, or pin a frame.",
    schema: {
      title: z.string().optional().describe("New Pod title"),
      description: z
        .string()
        .optional()
        .describe(
          "New Pod description. Must be plain text only (no markdown, HTML, or other formatting). Keep it brief and concise: 1-2 short sentences max."
        ),
      access: z
        .enum(["restricted", "open"])
        .optional()
        .describe(
          "Pod access. restricted = limited to invited members; open = all workspace members can join. Open Pods are subject to workspace policy."
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "low",
    displayLabels: {
      running: "Editing Pod information",
      done: "Edit Pod information",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  [UPDATE_MEMBERS_TOOL_NAME]: {
    description:
      "Add, remove, promote, or demote teammates as members or editors of an existing Pod.",
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Pod members",
      done: "Update Pod members",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  get_information: {
    description:
      "Read a Pod's URL, title, description, access, pinned frame, and attached Company Data references.",
    schema: {
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Pod information",
      done: "Get Pod information",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  [LIST_MEMBERS_TOOL_NAME]: {
    description: "List a Pod's members and editors.",
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Pod members",
      done: "List Pod members",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  list_pods: {
    description:
      "List Pods you belong to, or list open Pods with access='open'.",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  create_pod: {
    description:
      "Create a Pod. Defaults to restricted access and makes the creator an editor.",
    schema: {
      title: z.string().describe("Pod title"),
      description: z
        .string()
        .optional()
        .describe("Optional Pod description (plain text recommended)"),
      access: z
        .enum(["restricted", "open"])
        .optional()
        .default("restricted")
        .describe(
          "Pod access. Defaults to restricted. Open Pods are subject to workspace policy."
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  retrieve_recent_documents: {
    description:
      "Retrieve the most recent documents from a specific Pod and its attached Company Data nodes.",
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  [SEMANTIC_SEARCH_TOOL_NAME]: {
    description:
      "Search for information about a topic across Pod files, linked content nodes, and Pod conversation transcripts. Use searchScope to select files, conversations, or both.",
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
        .describe("Target Pod. Defaults to the current conversation's Pod."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Pod",
      done: "Search Pod",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  create_conversation: {
    description:
      "Start a separate conversation inside a specific Pod and post its first message. Use only when the user explicitly asks to create that conversation.",
    schema: {
      message: z.string().describe("First message for the new conversation."),
      title: z.string().describe("Title for the conversation"),
      agentName: z
        .string()
        .optional()
        .describe(
          "Pod agent to trigger. Omit to post the message without triggering an agent."
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  list_conversations: {
    description:
      "List a specific Pod's conversations by update time or unread status. Returns metadata unless includeMessages=true.",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  [MOVE_CONVERSATION_TOOL_NAME]: {
    description:
      "Move a conversation into a Pod or back to personal conversations.",
    schema: {
      destination: z
        .enum(["pod", "personal"])
        .describe(
          "Where to move the conversation: 'pod' = into a Pod; 'personal' = out of the Pod to personal conversations."
        ),
      conversationId: z
        .string()
        .optional()
        .describe(
          "Conversation id to move; defaults to the conversation this agent run is in when omitted"
        ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Target Pod when destination is 'pod'. Required when moving into a Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Moving conversation",
      done: "Move conversation",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  add_message_to_conversation: {
    description:
      "Post to an existing Pod conversation only when explicitly asked. Never use this tool for an ordinary reply. The active conversation is allowed only for an explicit handoff to agentName.",
    schema: {
      conversationId: z
        .string()
        .describe(
          "Required target conversation ID. To reply in the active conversation, respond normally without this tool. Target it only for an explicit handoff with agentName."
        ),
      message: z
        .string()
        .describe("Message to post in the target conversation."),
      agentName: z
        .string()
        .optional()
        .describe(
          "Pod agent to trigger. Required when targeting the active conversation; otherwise omit to post without triggering an agent."
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
});

export const POD_MANAGER_SERVER = {
  serverInfo: {
    name: "pod_manager",
    version: "1.0.0",
    description: `Manage Pods and separate Pod conversations. Files use \`${FILES_SERVER_NAME}\` under \`${SCOPED_PREFIX_POD}<id>/<rel>\`.`,
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(POD_MANAGER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POD_MANAGER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

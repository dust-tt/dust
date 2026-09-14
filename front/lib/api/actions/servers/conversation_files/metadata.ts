import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { z } from "zod";

export const CONVERSATION_FILES_SERVER_NAME = "conversation_files" as const;
// Legacy listing action (pre file-system mode). Lists every attachment in the conversation.
export const CONVERSATION_LIST_FILES_ACTION_NAME = "list";
// File-system mode listing action. The conversation's regular files have moved to the `files`
// MCP server, so this listing is narrowed to content nodes.
// TODO(20260504 FILE SYSTEM): the name still mentions tables. Renaming it changes a model-facing
// tool name recorded on past actions, so it is left alone until the legacy mode is removed.
export const CONVERSATION_LIST_CONTENT_NODES_AND_TABLES_ACTION_NAME =
  "list_content_nodes_and_tables";
export const CONVERSATION_CAT_FILE_ACTION_NAME = "cat";
export const CONVERSATION_SEARCH_FILES_ACTION_NAME = "semantic_search";

const CONVERSATION_LIST_FILES_TOOL_NAME = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_LIST_FILES_ACTION_NAME
);

const CONVERSATION_LIST_CONTENT_NODES_TOOL_NAME = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_LIST_CONTENT_NODES_AND_TABLES_ACTION_NAME
);

const CAT_FILE_TOOL = {
  description:
    "Read the contents of an attached conversation file by fileId, with " +
    "offset/limit and optional grep filtering. Useful for files too large " +
    "to read in full, or for searching specific patterns within a file.",
  schema: {
    fileId: z
      .string()
      .describe(
        "The fileId of the conversation attachment to retrieve and read, as " +
          `returned by \`${CONVERSATION_LIST_FILES_TOOL_NAME}\` or ` +
          `\`${CONVERSATION_LIST_CONTENT_NODES_TOOL_NAME}\``
      ),
    offset: z
      .number()
      .optional()
      .describe(
        "The character position to start reading from (0-based). If not provided, starts from " +
          "the beginning."
      ),
    limit: z
      .number()
      .optional()
      .describe(
        "The maximum number of characters to read. Capped to ~200K characters per call. " +
          "If the file is larger, use offset to paginate."
      ),
    grep: z
      .string()
      .optional()
      .describe(
        "A regular expression to filter lines. Applied after offset/limit slicing. Only lines " +
          "matching this pattern will be returned."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Reading file from conversation",
    done: "Read file from conversation",
  },
  toolCostCategory: "advanced" as const,
  freeUsage: false,
};

export const CONVERSATION_FILES_TOOLS_METADATA = [
  {
    name: CONVERSATION_LIST_FILES_ACTION_NAME,
    description:
      "List all files attached to the current conversation, including " +
      "available conversation file attachments, fileIds, titles, and " +
      "attachment flags.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing files in conversation",
      done: "List files in conversation",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  { name: CONVERSATION_CAT_FILE_ACTION_NAME, ...CAT_FILE_TOOL },
  {
    name: CONVERSATION_SEARCH_FILES_ACTION_NAME,
    description:
      "Search conversation files and content nodes semantically to find " +
      "relevant passages by meaning-based topic, concept, or terms.",
    schema: {
      query: z
        .string()
        .describe(
          "The natural-language topic, concept, or terms to search for " +
            "conversation files and content nodes."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching files in conversation",
      done: "Search files in conversation",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

// In file-system mode, regular files are accessed via the `files` MCP server. This server is
// narrowed to listing the attachments that don't live on the file mount: content nodes
// (Notion pages, Slack threads, etc.). The `cat` tool is kept so agents can read them.
export const CONVERSATION_FILES_TOOLS_METADATA_WITH_FILESYSTEM = [
  {
    name: CONVERSATION_LIST_CONTENT_NODES_AND_TABLES_ACTION_NAME,
    description:
      "List content-node references (for example Notion pages and Slack " +
      "threads) available in the current conversation. Regular files are not " +
      `listed here; they are accessible via the \`${FILES_SERVER_NAME}\` MCP server.`,
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing conversation attachments",
      done: "List conversation attachments",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  { name: CONVERSATION_CAT_FILE_ACTION_NAME, ...CAT_FILE_TOOL },
] as const;

// Union of the legacy and file-system-mode metadata. The runtime picks one or the other based on
// the conversation's `useFileSystem` flag, but the static server descriptor surfaces every tool
// name this server can register so UI discovery and monitoring labels cover both modes.
const ALL_CONVERSATION_FILES_TOOLS = [
  ...CONVERSATION_FILES_TOOLS_METADATA,
  CONVERSATION_FILES_TOOLS_METADATA_WITH_FILESYSTEM[0],
] as const;

export const CONVERSATION_FILES_SERVER = {
  serverInfo: {
    name: CONVERSATION_FILES_SERVER_NAME,
    version: "1.0.0",
    description:
      "List, read, and semantically search files and content nodes attached " +
      "to the conversation.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: ALL_CONVERSATION_FILES_TOOLS,
} as const satisfies ServerMetadata;

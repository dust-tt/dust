import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const CONVERSATION_FILES_SERVER_NAME = "conversation_files" as const;
export const CONVERSATION_LIST_FILES_ACTION_NAME = "list";
export const CONVERSATION_CAT_FILE_ACTION_NAME = "cat";
export const CONVERSATION_SEARCH_FILES_ACTION_NAME = "semantic_search";

export const CONVERSATION_FILES_TOOLS_METADATA = createToolsRecord({
  [CONVERSATION_LIST_FILES_ACTION_NAME]: {
    description: "List all files attached to the conversation.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing files in conversation",
      done: "List files in conversation",
    },
  },
  [CONVERSATION_CAT_FILE_ACTION_NAME]: {
    description:
      "Read the contents of a large file from conversation attachments with offset/limit and optional grep filtering (named after the 'cat' unix tool). " +
      "Use this when files are too large to read in full, or when you need to search for specific patterns within a file.",
    schema: {
      fileId: z
        .string()
        .describe(
          "The fileId of the attachment to read, as returned by the conversation_list_files action"
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
          "The maximum number of characters to read. If not provided, reads all characters."
        ),
      grep: z
        .string()
        .optional()
        .describe(
          "A regular expression to filter lines. Applied after offset/limit slicing. Only lines " +
            "matching this pattern will be returned."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading file from conversation",
      done: "Read file from conversation",
    },
  },
  [CONVERSATION_SEARCH_FILES_ACTION_NAME]: {
    description:
      "Perform a semantic search within the files attached to the conversation.",
    schema: {
      query: z.string().describe("The query to search for."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching files in conversation",
      done: "Search files in conversation",
    },
  },
});

// Add a custom description on each tool to indicate that the tools are available in the project context.
export const CONVERSATION_FILES_TOOLS_IN_PROJECT_METADATA = createToolsRecord({
  ...CONVERSATION_FILES_TOOLS_METADATA,
  [CONVERSATION_LIST_FILES_ACTION_NAME]: {
    ...CONVERSATION_FILES_TOOLS_METADATA[CONVERSATION_LIST_FILES_ACTION_NAME],
    description:
      "List all files attached to the conversation and in the project context.",
  },
  [CONVERSATION_SEARCH_FILES_ACTION_NAME]: {
    ...CONVERSATION_FILES_TOOLS_METADATA[CONVERSATION_SEARCH_FILES_ACTION_NAME],
    description:
      "Perform a semantic search within the files attached to the conversation and in the project context.",
  },
});

export const CONVERSATION_FILES_SERVER = {
  serverInfo: {
    name: CONVERSATION_FILES_SERVER_NAME,
    version: "1.0.0",
    description: "List, read and search files in the conversation.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(CONVERSATION_FILES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(CONVERSATION_FILES_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

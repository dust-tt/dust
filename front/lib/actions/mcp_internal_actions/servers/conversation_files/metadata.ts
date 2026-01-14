import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  DEFAULT_CONVERSATION_CAT_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// Re-export tool names for use by other modules.
export {
  DEFAULT_CONVERSATION_CAT_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
};

// Tool monitoring names.
export const LIST_FILES_MONITORING_NAME = "jit_list_files";
export const CAT_FILE_MONITORING_NAME = "jit_cat_file";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listFilesSchema = {};

export const catFileSchema = {
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
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const CONVERSATION_FILES_TOOLS: MCPToolType[] = [
  {
    name: DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
    description: "List all files attached to the conversation.",
    inputSchema: zodToJsonSchema(z.object(listFilesSchema)) as JSONSchema,
  },
  {
    name: DEFAULT_CONVERSATION_CAT_FILE_ACTION_NAME,
    description:
      "Read the contents of a large file from conversation attachments with offset/limit and optional grep filtering (named after the 'cat' unix tool). " +
      "Use this when files are too large to read in full, or when you need to search for specific patterns within a file.",
    inputSchema: zodToJsonSchema(z.object(catFileSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const CONVERSATION_FILES_SERVER_INFO = {
  name: "conversation_files" as const,
  version: "1.0.0",
  description: "Include files from conversation attachments.",
  icon: "ActionDocumentTextIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};

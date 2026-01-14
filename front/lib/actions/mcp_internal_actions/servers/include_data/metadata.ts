import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Re-export tool names from constants for backward compatibility.
export {
  FIND_TAGS_TOOL_NAME,
  INCLUDE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const includeInputSchema = {
  timeFrame:
    ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
    ].optional(),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
};

export const tagsInputSchema = {
  tagsIn: z
    .array(z.string())
    .optional()
    .describe(
      "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
        "If multiple labels are provided, the search will return documents that have at least one of the labels." +
        "You can't check that all labels are present, only that at least one is present." +
        "If no labels are provided, the search will return all documents regardless of their labels."
    ),
  tagsNot: z
    .array(z.string())
    .optional()
    .describe(
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context."
    ),
};

export const includeInputWithTagsSchema = {
  ...includeInputSchema,
  ...tagsInputSchema,
};

export const findTagsSchema = {
  query: z
    .string()
    .describe(
      "The text to search for in existing labels (also called tags) using edge ngram " +
        "matching (case-insensitive). Matches labels that start with any word in the " +
        "search text. The returned labels can be used in tagsIn/tagsNot parameters to " +
        "restrict or exclude content based on the user request and conversation context."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const INCLUDE_DATA_TOOLS: MCPToolType[] = [
  {
    name: "retrieve_recent_documents",
    description:
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
    inputSchema: zodToJsonSchema(
      z.object(includeInputWithTagsSchema)
    ) as JSONSchema,
  },
  {
    name: "find_tags",
    description:
      "Find exact matching labels (also called tags). " +
      "Restricting or excluding content succeeds only with existing labels. " +
      "Searching without verifying labels first typically returns no results. " +
      "The output of this tool can typically be used in `tagsIn` (if we want " +
      "to restrict the search to specific tags) or `tagsNot` (if we want to " +
      "exclude specific tags) parameters. " +
      "This tool is meant to be used before the retrieve_recent_documents tool.",
    inputSchema: zodToJsonSchema(z.object(findTagsSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const INCLUDE_DATA_SERVER_INFO = {
  name: "include_data" as const,
  version: "1.0.0",
  description: "Load complete content for full context up to memory limits.",
  authorization: null,
  icon: "ActionTimeIcon" as const,
  documentationUrl: null,
  instructions: null,
};

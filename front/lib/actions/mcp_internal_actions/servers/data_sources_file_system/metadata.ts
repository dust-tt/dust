import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { MCPToolType } from "@app/lib/api/mcp";

// Re-export tool names from constants for backward compatibility.
export {
  FILESYSTEM_CAT_TOOL_NAME,
  FILESYSTEM_FIND_TOOL_NAME,
  FILESYSTEM_LIST_TOOL_NAME,
  FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME,
  FIND_TAGS_TOOL_NAME,
  SEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const catToolInputSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  nodeId: z
    .string()
    .describe(
      "The ID of the node to read. This is not the human-readable node title."
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

export const listToolInputSchema = {
  nodeId: z
    .string()
    .nullable()
    .describe(
      "The exact ID of the node to list the contents of. " +
        "This ID can be found from previous search results in the 'nodeId' field. " +
        "If not provided, the content at the root of the filesystem will be shown."
    ),
  mimeTypes: z
    .array(z.string())
    .optional()
    .describe(
      "The mime types to search for. If provided, only nodes with one of these mime types " +
        "will be returned. If not provided, no filter will be applied. The mime types passed " +
        "here must be one of the mime types found in the 'mimeType' field."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  sortBy: z
    .enum(["title", "timestamp"])
    .optional()
    .describe(
      "Field to sort the results by. 'title' sorts alphabetically A-Z, 'timestamp' sorts by " +
        "most recent first. If not specified, results are returned in the default order, which is " +
        "folders first, then both documents and tables and alphabetically by title."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      "The maximum number of results to return. If not provided, returns all results."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "The cursor to use for fetching the next page of results. Pass this parameter to retrieve the " +
        "next page of results when there are more results than the limit."
    ),
};

export const searchToolInputSchema = {
  query: z
    .string()
    .describe(
      "The string used to perform a semantic search. Not a keyword search, but a semantic search. " +
        "A good query is 2-3 full sentences explaining the information you are looking for."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  relativeTimeFrame:
    ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
    ].optional(),
  nodeIds: z
    .array(z.string())
    .describe(
      "Array of exact content node IDs to search within. These are the 'nodeId' values from " +
        "previous search results. All children of the designated nodes will be searched. " +
        "If not provided, all available nodes will be searched."
    )
    .optional(),
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
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
};

export const findToolInputSchema = {
  query: z
    .string()
    .optional()
    .describe(
      "The title to search for. This supports partial matching and does not require the " +
        "exact title. For example, searching for 'budget' will find 'Budget 2024.xlsx', " +
        "'Q1 Budget Report', etc..."
    ),
  rootNodeId: z
    .string()
    .optional()
    .describe(
      "The node ID of the node to start the search from. If not provided, the search will " +
        "start from the root of the filesystem. This ID can be found from previous search " +
        "results in the 'nodeId' field. This parameter restricts the search to the children " +
        "and descendant of a specific node. If a node output by this tool or the list tool" +
        "has children (hasChildren: true), it means that it can be passed as a rootNodeId."
    ),
  mimeTypes: z
    .array(z.string())
    .optional()
    .describe(
      "The mime types to search for. If provided, only nodes with one of these mime types " +
        "will be returned. If not provided, no filter will be applied. The mime types passed " +
        "here must be one of the mime types found in the 'mimeType' field."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  limit: z
    .number()
    .optional()
    .describe(
      "The maximum number of results to return. If not provided, returns all results."
    ),
  nextPageCursor: z
    .string()
    .optional()
    .describe(
      "The cursor to use for fetching the next page of results. Pass this parameter to retrieve the " +
        "next page of results when there are more results than the limit."
    ),
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
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
};

export const locateTreeToolInputSchema = {
  nodeId: z.string().describe("The ID of the node to locate in the tree."),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
};

export const findTagsToolInputSchema = {
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

export const DATA_SOURCES_FILE_SYSTEM_TOOLS: MCPToolType[] = [
  {
    name: "cat",
    description:
      "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). " +
      "The nodeId can be obtained using the 'find', 'list' or 'search' tools.",
    inputSchema: zodToJsonSchema(z.object(catToolInputSchema)) as JSONSchema,
  },
  {
    name: "list",
    description:
      "List the direct contents of a node, like 'ls' in Unix. Should only be used on nodes with children " +
      "(hasChildren: true). A good fit is to explore the filesystem structure step " +
      "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
      "the next step's nodeId. If a node output by this tool or the find tool has children " +
      "(hasChildren: true), it means that this tool can be used again on it.",
    inputSchema: zodToJsonSchema(z.object(listToolInputSchema)) as JSONSchema,
  },
  {
    name: "search",
    description:
      "Perform a semantic search within the folders and files designated by `nodeIds`. All " +
      "children of the designated nodes will be searched.",
    inputSchema: zodToJsonSchema(z.object(searchToolInputSchema)) as JSONSchema,
  },
  {
    name: "find",
    description:
      "Find content based on their title starting from a specific node. Can be used to find specific " +
      "nodes by searching for their titles. The query title can be omitted to list all nodes " +
      "starting from a specific node. This is like using 'find' in Unix.",
    inputSchema: zodToJsonSchema(z.object(findToolInputSchema)) as JSONSchema,
  },
  {
    name: "locate_in_tree",
    description:
      "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
      "This is useful for understanding where a specific node is located within the data source structure. " +
      "The path is returned as a list of nodes, with the first node being the data source root and " +
      "the last node being the target node.",
    inputSchema: zodToJsonSchema(
      z.object(locateTreeToolInputSchema)
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
      "This tool is meant to be used before the search or find tools.",
    inputSchema: zodToJsonSchema(
      z.object(findTagsToolInputSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const DATA_SOURCES_FILE_SYSTEM_SERVER_INFO = {
  name: "data_sources_file_system" as const,
  version: "1.0.0",
  description: "Browse and search content with filesystem-like navigation.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS,
};

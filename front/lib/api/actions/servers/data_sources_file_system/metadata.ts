// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DataSourceFilesystemFindInputSchema,
  DataSourceFilesystemListInputSchema,
  SearchWithNodesInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";

export const DATA_SOURCES_FILE_SYSTEM_SERVER_NAME =
  "data_sources_file_system" as const;

export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_SEARCH_TOOL_NAME = "semantic_search";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export const DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA = createToolsRecord({
  [FILESYSTEM_CAT_TOOL_NAME]: {
    description:
      "Read the contents of a node with offset/limit and optional grep filtering (named after the 'cat' unix tool). " +
      "Use this when nodes are too large to read in full, or when you need to search for specific patterns within a node.",
    schema: {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading file from data source",
      done: "Read file from data source",
    },
  },
  [FILESYSTEM_LIST_TOOL_NAME]: {
    description:
      "List the direct contents of a node, like 'ls' in Unix. Should only be used on nodes with children " +
      "(hasChildren: true). A good fit is to explore the filesystem structure step " +
      "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
      "the next step's nodeId. If a node output by this tool or the find tool has children " +
      "(hasChildren: true), it means that this tool can be used again on it.",
    schema: DataSourceFilesystemListInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Listing data source contents",
      done: "List data source contents",
    },
  },
  [FILESYSTEM_SEARCH_TOOL_NAME]: {
    description:
      "Search for content nodes semantically using a query string. Returns matching nodes with their content.",
    schema: SearchWithNodesInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Searching data sources",
      done: "Search data sources",
    },
  },
  [FILESYSTEM_FIND_TOOL_NAME]: {
    description:
      "Find nodes by title/name (like 'find' in Unix). Supports partial matching and can search " +
      "within a specific subtree using rootNodeId. Returns matching nodes without their full content.",
    schema: DataSourceFilesystemFindInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Finding in data sources",
      done: "Find in data sources",
    },
  },
  [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]: {
    description:
      "Locate a specific node in the folder hierarchy tree. Returns the path from root to the node, " +
      "showing the hierarchy of parent folders. Useful to understand where a node is located in the structure.",
    schema: {
      nodeId: z
        .string()
        .describe("The ID of the node to locate in the tree hierarchy."),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    stake: "never_ask",
    displayLabels: {
      running: "Locating content in hierarchy",
      done: "Locate content in hierarchy",
    },
  },
  [FIND_TAGS_TOOL_NAME]: {
    description:
      "Discover available tags/labels that can be used to filter content. Returns tags " +
      "with their usage counts. Only available when dynamic tags are enabled.",
    schema: {
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    stake: "never_ask",
    displayLabels: {
      running: "Finding tags",
      done: "Find tags",
    },
  },
});

// Tool metadata with tags support for search and find tools
export const DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA =
  createToolsRecord({
    [FILESYSTEM_CAT_TOOL_NAME]:
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_CAT_TOOL_NAME],
    [FILESYSTEM_LIST_TOOL_NAME]:
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_LIST_TOOL_NAME],
    [FILESYSTEM_SEARCH_TOOL_NAME]: {
      ...DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_SEARCH_TOOL_NAME],
      schema: {
        ...SearchWithNodesInputSchema.shape,
        ...TagsInputSchema.shape,
      },
    },
    [FILESYSTEM_FIND_TOOL_NAME]: {
      ...DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_FIND_TOOL_NAME],
      schema: {
        ...DataSourceFilesystemFindInputSchema.shape,
        ...TagsInputSchema.shape,
      },
    },
    [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]:
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[
        FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME
      ],
    [FIND_TAGS_TOOL_NAME]:
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FIND_TAGS_TOOL_NAME],
  });

export const DATA_SOURCES_FILE_SYSTEM_SERVER = {
  serverInfo: {
    name: "data_sources_file_system",
    version: "1.0.0",
    description: "Browse and search content with filesystem-like navigation.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
    instructions: DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS,
  },
  tools: Object.values(DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

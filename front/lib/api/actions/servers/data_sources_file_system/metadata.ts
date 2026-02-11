// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DataSourceFilesystemCatInputSchema,
  DataSourceFilesystemFindInputSchema,
  DataSourceFilesystemListInputSchema,
  DataSourceFilesystemLocateTreeInputSchema,
  SearchWithNodesInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  FIND_TAGS_BASE_DESCRIPTION,
  findTagsSchema,
} from "@app/lib/api/actions/tools/find_tags/metadata";

export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_SEARCH_TOOL_NAME = "semantic_search";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export const DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA = createToolsRecord({
  [FILESYSTEM_CAT_TOOL_NAME]: {
    description:
      "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). The nodeId can be obtained using the 'find', 'list' or 'search' tools.",
    schema: DataSourceFilesystemCatInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Reading file from data source",
      done: "Read file from data source",
    },
    enableAlerting: true,
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
    enableAlerting: true,
  },
  [FILESYSTEM_SEARCH_TOOL_NAME]: {
    description:
      "Perform a semantic search within the folders and files designated by `nodeIds`. All children of the designated nodes will be searched.",
    schema: SearchWithNodesInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Searching data sources",
      done: "Search data sources",
    },
    enableAlerting: true,
  },
  [FILESYSTEM_FIND_TOOL_NAME]: {
    description:
      "Find content based on their title starting from a specific node. Can be used to find specific nodes by searching for their titles. " +
      "The query title can be omitted to list all nodes starting from a specific node. This is like using 'find' in Unix.",
    schema: DataSourceFilesystemFindInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Finding in data sources",
      done: "Find in data sources",
    },
    enableAlerting: true,
  },
  [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]: {
    description:
      "Show the complete path from a node to the data source root, displaying the hierarchy of parent nodes. " +
      "This is useful for understanding where a specific node is located within the data source structure. " +
      "The path is returned as a list of nodes, with the first node being the data source root and the last node being the target node.",
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
    enableAlerting: true,
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
    [FIND_TAGS_TOOL_NAME]: {
      description: FIND_TAGS_BASE_DESCRIPTION,
      schema: findTagsSchema,
      stake: "never_ask",
      displayLabels: {
        running: "Finding tags",
        done: "Find tags",
      },
      enableAlerting: true,
    },
  });

export const DATA_SOURCES_FILE_SYSTEM_SERVER = {
  serverInfo: {
    name: "data_sources_file_system",
    version: "1.0.0",
    description: "Browse and search content with filesystem-like navigation.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
    // TODO(2026-02-09 aubin): clean this up once global agents are moved to
    //  using the Discover Knowledge skill.
    // eslint-disable-next-line dust/no-mcp-server-instructions
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

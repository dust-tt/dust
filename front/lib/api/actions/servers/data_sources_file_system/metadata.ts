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
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_SEARCH_TOOL_NAME = "semantic_search";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export const DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA = createToolsRecord({
  [FILESYSTEM_CAT_TOOL_NAME]: {
    description:
      "Read the text content of a connected data source document or page. " +
      "Useful for exact quotes, source checks, or reading a known item.",
    schema: DataSourceFilesystemCatInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Reading file from data source",
      done: "Read file from data source",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
    enableAlerting: true,
  },
  [FILESYSTEM_LIST_TOOL_NAME]: {
    description:
      "List and browse the direct contents of a connected data source root " +
      "or folder, such as folders, pages, and documents.",
    schema: DataSourceFilesystemListInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Listing data source contents",
      done: "List data source contents",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
    enableAlerting: true,
  },
  [FILESYSTEM_SEARCH_TOOL_NAME]: {
    description:
      "Search connected company data sources semantically for knowledge, " +
      "content, documents, and topics. Useful when you know what information " +
      "you need but not the exact page or title.",
    schema: SearchWithNodesInputSchema.shape,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Searching data sources",
      done: "Search data sources",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
    enableAlerting: true,
  },
  [FILESYSTEM_FIND_TOOL_NAME]: {
    description:
      "Find connected data source wiki pages, documents, folders, or " +
      "sections by title. Useful when you know all or part of the item's " +
      "title.",
    schema: DataSourceFilesystemFindInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Finding in data sources",
      done: "Find in data sources",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
    enableAlerting: true,
  },
  [FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME]: {
    description:
      "Show the breadcrumb path of a connected data source item. Useful for " +
      "understanding where a search result or document sits in the hierarchy.",
    schema: DataSourceFilesystemLocateTreeInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Locating content in hierarchy",
      done: "Locate content in hierarchy",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
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
      toolCostCategory: "advanced",
      freeUsage: false,
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
  },
  tools: Object.values(DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

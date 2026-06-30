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
      "Read and retrieve the text content of a document or page by its nodeId (like 'cat' in Unix). " +
      `Use to open, view, or read a specific file after locating it via '${FILESYSTEM_FIND_TOOL_NAME}', '${FILESYSTEM_LIST_TOOL_NAME}', or '${FILESYSTEM_SEARCH_TOOL_NAME}'. ` +
      "The nodeId is the unique identifier exposed in the output of all navigation and search tools in this server. " +
      "The output reports the document's total size. For large documents, use 'grep' to extract only the relevant " +
      "content rather than paging through the whole document by incrementing 'offset', which exhausts the context window.",
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
      "Browse or explore the direct contents of a folder, section, or container node (like 'ls' in Unix). " +
      "Use to navigate the data source structure, see what documents or sub-folders are available, " +
      "or enumerate items inside a known location. Only works on nodes with children (hasChildren: true). " +
      "Call repeatedly with the 'nodeId' from each result to traverse nested folders step by step.",
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
      "Search for information, documents, or content by semantic similarity within the data source. " +
      "Use to find relevant passages, answer questions, look up knowledge, or retrieve content from " +
      "connected spaces. Searches all children of the designated nodeIds. " +
      `Prefer this over '${FILESYSTEM_FIND_TOOL_NAME}' when you know what you're looking for conceptually but not the exact document title.`,
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
      "Locate a document, page, or folder by searching its title (like 'find' in Unix). " +
      "Use to find a specific file or wiki page by name when you know (part of) its title — partial matches are supported. " +
      "Omit the query to enumerate all nodes under a given root. " +
      `Prefer '${FILESYSTEM_SEARCH_TOOL_NAME}' when looking for content by topic rather than by exact title.`,
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
      "Show the full breadcrumb path from a node back to the root of the data source (like 'pwd' in Unix). " +
      "Use to understand where a document lives in the folder hierarchy, navigate to parent sections, " +
      "or display the location of a search result. " +
      "Returns an ordered list of ancestor nodes from root to the target node.",
    schema: DataSourceFilesystemLocateTreeInputSchema.shape,
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

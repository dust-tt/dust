import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SearchWithDataSourcesInputSchema } from "@app/lib/actions/mcp_internal_actions/types";
import { FIND_TAGS_TOOL_NAME } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

// Define constants locally to avoid circular dependency with constants.ts
export const SEARCH_SERVER_NAME = "search";
export const SEARCH_TOOL_NAME = "semantic_search";

export const SEARCH_TOOL_DESCRIPTION =
  "Search the data sources specified by the user." +
  " The search is based on semantic similarity between the query and chunks of information" +
  " from the data sources.";

export const SEARCH_TOOLS_METADATA = [
  {
    name: SEARCH_TOOL_NAME,
    description: SEARCH_TOOL_DESCRIPTION,
    schema: SearchWithDataSourcesInputSchema.shape,
    stake: "never_ask" as const,
    displayLabels: {
      running: "Searching data sources",
      done: "Search data sources",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const satisfies readonly InternalMCPToolType[];

export const SEARCH_TOOL_METADATA_WITH_TAGS = [
  ...SEARCH_TOOLS_METADATA,
  {
    name: FIND_TAGS_TOOL_NAME,
    description:
      "Discover available tags/labels that can be used to filter content. Returns tags " +
      "with their usage counts. Only available when dynamic tags are enabled.",
    schema: {
      query: z
        .string()
        .describe(
          "The text to search for in existing labels (also called tags) using edge ngram " +
            "matching (case-insensitive). Matches labels that start with any word in the " +
            "search text. The returned labels can be used in tagsIn/tagsNot parameters to " +
            "restrict or exclude content based on the user request and conversation context."
        ),
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
    toolCostCategory: "advanced",
    freeUsage: false,
    enableAlerting: true,
  },
] as const satisfies readonly InternalMCPToolType[];

export const SEARCH_SERVER = {
  serverInfo: {
    name: SEARCH_SERVER_NAME,
    version: "1.0.0",
    description:
      "Search content whose meaning best matches your message (not suited for analytics).",
    icon: "ActionMagnifyingGlassIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: SEARCH_TOOLS_METADATA,
} as const satisfies ServerMetadata;

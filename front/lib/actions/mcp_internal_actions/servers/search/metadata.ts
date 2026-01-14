import type { JSONSchema7 as JSONSchema } from "json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  SearchInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool name for the search tool.
export const SEARCH_TOOL_NAME = "semantic_search";

// Re-export from types.ts for convenience.
export { SearchInputSchema, TagsInputSchema };

// Combined schema with tags (superset for static tool definition).
export const SearchWithTagsInputSchema = SearchInputSchema.extend(
  TagsInputSchema.shape
);

export const SEARCH_TOOLS: MCPToolType[] = [
  {
    name: SEARCH_TOOL_NAME,
    description:
      "Search the data sources specified by the user. " +
      "The search is based on semantic similarity between the query and chunks of information " +
      "from the data sources.",
    inputSchema: zodToJsonSchema(SearchWithTagsInputSchema) as JSONSchema,
  },
];

export const SEARCH_SERVER_INFO = {
  name: "search" as const,
  version: "1.0.0",
  description: "Search content to find the most relevant information.",
  authorization: null,
  icon: "ActionMagnifyingGlassIcon" as const,
  documentationUrl: null,
  instructions: null,
};

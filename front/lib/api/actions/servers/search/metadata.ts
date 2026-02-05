import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SearchInputSchema } from "@app/lib/actions/mcp_internal_actions/types";

// Define constants locally to avoid circular dependency with constants.ts
export const SEARCH_SERVER_NAME = "search";
export const SEARCH_TOOL_NAME = "semantic_search";

export const SEARCH_TOOL_DESCRIPTION =
  "Search the data sources specified by the user." +
  " The search is based on semantic similarity between the query and chunks of information" +
  " from the data sources.";

export const SEARCH_TOOLS_METADATA = createToolsRecord({
  [SEARCH_TOOL_NAME]: {
    description: SEARCH_TOOL_DESCRIPTION,
    schema: SearchInputSchema.shape,
    stake: "never_ask" as const,
    displayLabels: {
      running: "Searching data sources",
      done: "Search data sources",
    },
  },
});

export const SEARCH_SERVER = {
  serverInfo: {
    name: SEARCH_SERVER_NAME,
    version: "1.0.0",
    description: "Search content to find the most relevant information.",
    icon: "ActionMagnifyingGlassIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SEARCH_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SEARCH_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

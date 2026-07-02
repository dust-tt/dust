import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  FIND_TAGS_BASE_DESCRIPTION,
  findTagsSchema,
} from "@app/lib/api/actions/tools/find_tags/metadata";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const RETRIEVE_RECENT_DOCUMENTS_DESCRIPTION =
  "Load and include full document content, documents, or docs from selected data sources or the company knowledge base as conversation context. " +
  "Retrieves the most recent documents in reverse chronological order up to the retrieval limit, " +
  "so the latest pre-configured information is included when the agent needs broad full-context data or all available recent content.";

// Base tool without tags support
export const INCLUDE_DATA_BASE_TOOLS_METADATA = createToolsRecord({
  retrieve_recent_documents: {
    description: RETRIEVE_RECENT_DOCUMENTS_DESCRIPTION,
    schema: IncludeInputSchema.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving recent documents",
      done: "Retrieve recent documents",
    },
  },
});

// Extended schema with tags support (used when tags are dynamic)
const includeWithTagsSchema = {
  ...IncludeInputSchema.shape,
  ...TagsInputSchema.shape,
};

export const INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA = createToolsRecord({
  retrieve_recent_documents: {
    description: RETRIEVE_RECENT_DOCUMENTS_DESCRIPTION,
    schema: includeWithTagsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving recent documents",
      done: "Retrieve recent documents",
    },
  },
  find_tags: {
    description:
      FIND_TAGS_BASE_DESCRIPTION +
      " This tool is meant to be used before the retrieve_recent_documents tool.",
    schema: findTagsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Finding tags",
      done: "Find tags",
    },
  },
});

// For the server metadata, we use the base schema
export const INCLUDE_DATA_SERVER = {
  serverInfo: {
    name: "include_data",
    version: "1.0.0",
    description:
      "Load complete content for full context up to memory limits. Note: won't include spreadsheet/table data.",
    icon: "ActionTimeIcon",
    authorization: null,
    documentationUrl: null,
    toolCategory: "advanced",
  },
  tools: Object.values(INCLUDE_DATA_BASE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(INCLUDE_DATA_BASE_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

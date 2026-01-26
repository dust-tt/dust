// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import {
  FIND_TAGS_BASE_DESCRIPTION,
  findTagsSchema,
} from "@app/lib/api/actions/tools/find_tags";

export const INCLUDE_DATA_TOOL_NAME = "include_data" as const;

// Base tool without tags support
export const INCLUDE_DATA_BASE_TOOLS_METADATA = createToolsRecord({
  retrieve_recent_documents: {
    description:
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
    schema: IncludeInputSchema.shape,
    stake: "never_ask",
  },
});

// Extended schema with tags support (used when tags are dynamic)
const includeWithTagsSchema = {
  ...IncludeInputSchema.shape,
  ...TagsInputSchema.shape,
};

export const INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA = createToolsRecord({
  retrieve_recent_documents: {
    description:
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
    schema: includeWithTagsSchema,
    stake: "never_ask",
  },
  find_tags: {
    description:
      FIND_TAGS_BASE_DESCRIPTION +
      " This tool is meant to be used before the retrieve_recent_documents tool.",
    schema: findTagsSchema,
    stake: "never_ask",
  },
});

// For the server metadata, we use the base schema
export const INCLUDE_DATA_SERVER = {
  serverInfo: {
    name: "include_data",
    version: "1.0.0",
    description: "Load complete content for full context up to memory limits.",
    icon: "ActionTimeIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(INCLUDE_DATA_BASE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(INCLUDE_DATA_BASE_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

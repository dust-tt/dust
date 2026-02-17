// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { TagsInputSchema } from "@app/lib/actions/mcp_internal_actions/types";
import {
  FIND_TAGS_BASE_DESCRIPTION,
  findTagsSchema,
} from "@app/lib/api/actions/tools/find_tags/metadata";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const EXTRACT_DATA_TOOL_NAME = "extract_data" as const;
export const EXTRACT_DATA_MAIN_TOOL_NAME =
  "extract_information_from_documents" as const;

const EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION =
  "A JSON schema that will be embedded in the following JSON schema:" +
  "\n```\n" +
  "{\n" +
  '  "name": "extract_data",\n' +
  '  "description": "Call this function with an array of extracted data points",\n' +
  '  "parameters": {\n' +
  '    "type": "object",\n' +
  '    "properties": {\n' +
  '      "data_points": {\n' +
  '         "type": "array",\n' +
  '         "items": $SCHEMA,\n' +
  '          "description": "The data points extracted from provided documents, as many as required to follow instructions."\n' +
  "        }\n" +
  "      },\n" +
  '      "required": ["data_points"]\n' +
  "    }\n" +
  "  }\n" +
  "}\n" +
  "```\n\n" +
  "Must be a valid JSON schema. Use only standard JSON Schema 7 core fields (type, properties, required, description) and avoid custom keywords or extensions that are not part of the core specification.\n\n" +
  "This schema will be used as signature to extract the relevant information based on selected documents to properly follow instructions.";

// JSON Schema for extraction - when not pre-configured by user
const JsonSchemaSchema = z
  .object({})
  .passthrough()
  .describe(EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION);

// Time frame schema - when not pre-configured by user
const DynamicTimeFrameSchema = z
  .object({
    duration: z.number(),
    unit: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .describe(
    "The time frame to use for documents retrieval (e.g. last 7 days, last 2 months). Leave null to search all documents regardless of time."
  )
  .optional();

// Common schema fields
const objectiveSchema = z
  .string()
  .describe(
    "The objective behind the use of the tool based on the conversation state." +
      " This is used to guide the tool to extract the right data based on the user request."
  );

// Base tool schema (without tags, with dynamic jsonSchema and timeFrame)
const baseExtractSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  objective: objectiveSchema,
  jsonSchema: JsonSchemaSchema,
  timeFrame: DynamicTimeFrameSchema,
};

// With tags schema
const extractWithTagsSchema = {
  ...baseExtractSchema,
  ...TagsInputSchema.shape,
};

// Tool description
const TOOL_DESCRIPTION =
  "Extract structured information from documents in reverse chronological order, according to the needs described by the objective and specified by a" +
  " JSON schema. This tool retrieves content" +
  " from data sources already pre-configured by the user, ensuring the latest information is included.";

// Base tools metadata (without tags)
export const EXTRACT_DATA_BASE_TOOLS_METADATA = createToolsRecord({
  [EXTRACT_DATA_MAIN_TOOL_NAME]: {
    description: TOOL_DESCRIPTION,
    schema: baseExtractSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Extracting data from documents",
      done: "Extract data from documents",
    },
  },
});

// Tools metadata with tags support
export const EXTRACT_DATA_WITH_TAGS_TOOLS_METADATA = createToolsRecord({
  [EXTRACT_DATA_MAIN_TOOL_NAME]: {
    description: TOOL_DESCRIPTION,
    schema: extractWithTagsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Extracting data from documents",
      done: "Extract data from documents",
    },
  },
  find_tags: {
    description:
      FIND_TAGS_BASE_DESCRIPTION +
      ` This tool is meant to be used before the ${EXTRACT_DATA_MAIN_TOOL_NAME} tool.`,
    schema: findTagsSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Finding tags",
      done: "Find tags",
    },
  },
});

// Server metadata - used in constants.ts
export const EXTRACT_DATA_SERVER = {
  serverInfo: {
    name: "extract_data",
    version: "1.0.0",
    description: "Parse documents to create structured datasets.",
    icon: "ActionScanIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(EXTRACT_DATA_BASE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(EXTRACT_DATA_BASE_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

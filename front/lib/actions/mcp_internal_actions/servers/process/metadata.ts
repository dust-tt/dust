import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  ConfigurableToolInputSchemas,
  JsonSchemaSchema,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const PROCESS_TOOL_NAME = "extract_information_from_documents";
export const FIND_TAGS_TOOL_NAME = "find_tags";

export const EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION =
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

export const extractDataTagsInputSchema = {
  tagsIn: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
        "If multiple labels are provided, the search will return documents that have at least one of the labels." +
        "You can't check that all labels are present, only that at least one is present." +
        "If no labels are provided, the search will return all documents regardless of their labels."
    ),
  tagsNot: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
};

// Note: jsonSchema and timeFrame fields are dynamically configured at runtime
// based on agent configuration, so we use the non-configured versions here.
export const extractDataCommonInputsSchema = {
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  objective: z
    .string()
    .describe(
      "The objective behind the use of the tool based on the conversation state." +
        " This is used to guide the tool to extract the right data based on the user request."
    ),
  jsonSchema: JsonSchemaSchema.describe(
    EXTRACT_TOOL_JSON_SCHEMA_ARGUMENT_DESCRIPTION
  ),
  timeFrame: z
    .object({
      duration: z.number(),
      unit: z.enum(["hour", "day", "week", "month", "year"]),
    })
    .describe(
      "The time frame to use for documents retrieval (e.g. last 7 days, last 2 months). Leave null to search all documents regardless of time."
    )
    .optional(),
};

// Combined schema with tags (superset for static tool definition).
export const extractDataWithTagsInputSchema = z.object({
  ...extractDataCommonInputsSchema,
  ...extractDataTagsInputSchema,
});

export const EXTRACT_DATA_TOOLS: MCPToolType[] = [
  {
    name: PROCESS_TOOL_NAME,
    description:
      "Extract structured information from documents in reverse chronological order, according to the needs described by the objective and specified by a JSON schema. This tool retrieves content from data sources already pre-configured by the user, ensuring the latest information is included.",
    inputSchema: zodToJsonSchema(extractDataWithTagsInputSchema) as JSONSchema,
  },
  {
    name: FIND_TAGS_TOOL_NAME,
    description:
      "Find available tags/labels in the configured data sources. This tool is meant to be used before the extract_information_from_documents tool.",
    inputSchema: zodToJsonSchema(
      z.object({
        dataSources:
          ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
          ],
      })
    ) as JSONSchema,
  },
];

export const EXTRACT_DATA_SERVER_INFO = {
  name: "extract_data" as const,
  version: "1.0.0",
  description: "Parse documents to create structured datasets.",
  icon: "ActionScanIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};

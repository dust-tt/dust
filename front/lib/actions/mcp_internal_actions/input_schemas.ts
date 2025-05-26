import type { InternalToolInputMimeType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const DATA_SOURCE_CONFIGURATION_URI_PATTERN =
  /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/;

export const TABLE_CONFIGURATION_URI_PATTERN =
  /^table_configuration:\/\/dust\/w\/(\w+)\/table_configurations\/(\w+)$/;

// URI pattern for configuring the agent to use within an action.
export const AGENT_CONFIGURATION_URI_PATTERN =
  // We accept dashes in the last part, which is the agent sId,
  // because global agents have dashes in their sId.
  /^agent:\/\/dust\/w\/(\w+)\/agents\/([\w-]+)$/;

// The full, recursive schema for a JSON schema is not yet supported by MCP call
// tool, and anyways its full validation is not needed. Therefore, we describe 2
// levels of depth then use z.any(). As an added bonus, it is arguably better
// for the tool call to generate a good argument.
const JsonTypeSchema = z.union([
  z.literal("object"),
  z.literal("string"),
  z.literal("number"),
  z.literal("integer"),
  z.literal("boolean"),
  z.literal("array"),
  z.literal("null"),
]);

const JsonPropertySchema = z.object({
  type: JsonTypeSchema,
  description: z.string(),
  properties: z
    .record(
      z.string(),
      z.object({
        type: JsonTypeSchema,
        description: z.string(),
        properties: z.record(z.string(), z.any()).optional(),
        required: z.array(z.string()).optional(),
      })
    )
    .optional(),
  required: z.array(z.string()).optional(),
});

// The double "Schema" is intentional, it's a zod schema for a JSON schema.
export const JsonSchemaSchema = z.object({
  type: z.literal("object"),
  required: z.array(z.string()).optional(),
  properties: z.record(z.string(), JsonPropertySchema).optional(),
});

/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 * Not all mime types have a fixed schema, for instance the ENUM mime type is flexible.
 */
export const ConfigurableToolInputSchemas = {
  [INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE]: z.array(
    z.object({
      uri: z.string().regex(DATA_SOURCE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE),
    })
  ),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE]: z.array(
    z.object({
      uri: z.string().regex(TABLE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE),
    })
  ),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT]: z.object({
    uri: z.string().regex(AGENT_CONFIGURATION_URI_PATTERN),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.STRING]: z.object({
    value: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.STRING),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER]: z.object({
    value: z.number(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN]: z.object({
    value: z.boolean(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL]: z.object({
    modelId: z.string(),
    providerId: z.string(),
    temperature: z.number().nullable(),
    reasoningEffort: z.string().nullable(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP]: z.object({
    appId: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME]: z
    .object({
      duration: z.number(),
      unit: z.enum(["hour", "day", "week", "month", "year"]),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME),
    })
    .describe("An optional time frame to use for the tool.")
    .nullable(),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA]: z.intersection(
    JsonSchemaSchema,
    z.object({
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA),
    })
  ),
  // All mime types do not necessarily have a fixed schema,
  // for instance the ENUM mime type is flexible and the exact content of the enum is dynamic.
} as const satisfies Omit<
  Record<InternalToolInputMimeType, z.ZodType>,
  typeof INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM
>;

// Type for the tool inputs that have a flexible schema, which are schemas that can vary between tools.
type FlexibleConfigurableToolInput = {
  [INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM]: {
    value: string;
    mimeType: typeof INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM;
  };
};

export type ConfigurableToolInputType =
  | z.infer<
      (typeof ConfigurableToolInputSchemas)[keyof typeof ConfigurableToolInputSchemas]
    >
  | FlexibleConfigurableToolInput[keyof FlexibleConfigurableToolInput];

export type DataSourcesToolConfigurationType = z.infer<
  (typeof ConfigurableToolInputSchemas)[typeof INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE]
>;

export type TablesConfigurationToolType = z.infer<
  (typeof ConfigurableToolInputSchemas)[typeof INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE]
>;

/**
 * Mapping between the mime types we used to identify a configurable resource
 * and the JSON schema resulting from the Zod schema defined above.
 */
export const ConfigurableToolInputJSONSchemas = Object.fromEntries(
  Object.entries(ConfigurableToolInputSchemas).map(([key, schema]) => [
    key,
    zodToJsonSchema(schema),
  ])
) as Omit<
  Record<InternalToolInputMimeType, JSONSchema>,
  typeof INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM
>;

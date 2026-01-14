import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const JIT_ALL_OPTIONALS_AND_DEFAULTS_TOOL_NAME =
  "jit_all_optionals_and_defaults";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const jitAllOptionalsAndDefaultsSchema = {
  // TIME_FRAME: default and optional variants
  timeFrameDefault: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
  ]
    .describe("TIME_FRAME with default value")
    .default({
      duration: 7,
      unit: "day",
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME,
    }),
  timeFrameOptional: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
  ]
    .describe("Optional TIME_FRAME")
    .optional(),

  // JSON_SCHEMA: default and optional variants
  jsonSchemaDefault: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
  ]
    .describe("JSON_SCHEMA with default value")
    .default({
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
    }),
  jsonSchemaOptional: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA
  ]
    .describe("Optional JSON_SCHEMA")
    .optional(),

  // DATA_SOURCE: optional
  dataSourceOptional: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
  ]
    .describe("Optional DATA_SOURCE list")
    .optional(),

  // AGENT: optional
  agentOptional: ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT
  ]
    .describe("Optional child agent")
    .optional(),

  note: z.string().describe("Optional note for debugging").optional(),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const JIT_TESTING_TOOLS: MCPToolType[] = [
  {
    name: JIT_ALL_OPTIONALS_AND_DEFAULTS_TOOL_NAME,
    description:
      "A single tool aggregating optional/default configs for TIME_FRAME, JSON_SCHEMA, DATA_SOURCE, and AGENT for JIT testing.",
    inputSchema: zodToJsonSchema(
      z.object(jitAllOptionalsAndDefaultsSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const JIT_TESTING_SERVER_INFO = {
  name: "jit_testing" as const,
  version: "1.0.0",
  description: "Demo server to test if can be added to JIT.",
  icon: "ActionEmotionLaughIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};

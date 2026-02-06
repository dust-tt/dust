// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const JIT_TESTING_TOOL_NAME = "jit_testing" as const;

export const JIT_TESTING_TOOLS_METADATA = createToolsRecord({
  jit_all_optionals_and_defaults: {
    description:
      "A single tool aggregating optional/default configs for TIME_FRAME, JSON_SCHEMA, DATA_SOURCE, and AGENT for JIT testing.",
    schema: {
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
    },
    stake: "high",
    displayLabels: {
      running: "Testing JIT",
      done: "Test JIT",
    },
  },
});

export const JIT_TESTING_SERVER = {
  serverInfo: {
    name: "jit_testing",
    version: "1.0.0",
    description: "Demo server to test if can be added to JIT.",
    icon: "ActionEmotionLaughIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(JIT_TESTING_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(JIT_TESTING_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

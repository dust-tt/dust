// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PRIMITIVE_TYPES_DEBUGGER_TOOL_NAME =
  "primitive_types_debugger" as const;

// Schema for tool_without_user_config
const toolWithoutUserConfigSchema = {
  query: z.string(),
};

// Schema for pass_through - demonstrates various configurable input types
const passThroughSchema = {
  query: z.string(),
  user: z.object({
    name: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.STRING]
      .describe("The name of the user")
      .default({
        value: "John Doe",
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
      }),
    age: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER]
      .describe("The age of the user")
      .default({
        value: 30,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
      }),
    admin: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN]
      .describe("Whether the user is an admin")
      .default({
        value: true,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
      }),
    location: ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
    ].describe("The location of the user"),
    enabled: ConfigurableToolInputSchemas[
      INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN
    ].describe("Whether the user is enabled"),
    category: z
      .object({
        value: z.enum(["A", "B", "C"]),
        mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
      })
      .describe("The category of the user"),
  }),
  choices: z
    .object({
      options: z
        .union([
          z
            .object({
              value: z.literal("A"),
              label: z.literal("Label A"),
            })
            .describe("The label of the choice"),
          z
            .object({
              value: z.literal("B"),
              label: z.literal("Label B"),
            })
            .describe("The label of the choice"),
          z
            .object({
              value: z.literal("C"),
              label: z.literal("Label C"),
            })
            .describe("The label of the choice"),
        ])
        // Options are optional because we only need them for the UI but they won't be provided when the tool is called.
        .optional(),
      // "values" are required because they are used to provide the selected values when the tool is called.
      values: z.array(z.string()).describe("The values of the choices"),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.LIST),
    })
    .describe("Indicate the choices the agent can select from"),
};

// Tools metadata
export const PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA = createToolsRecord({
  tool_without_user_config: {
    description: "This tool is used to test the tool without user config.",
    schema: toolWithoutUserConfigSchema,
    stake: "high",
    displayLabels: {
      running: "Running debug tool",
      done: "Run debug tool",
    },
  },
  pass_through: {
    description: "Super useful tool that should be used at all times.",
    schema: passThroughSchema,
    stake: "high",
    displayLabels: {
      running: "Passing through",
      done: "Pass through",
    },
  },
});

// Server metadata - used in constants.ts
export const PRIMITIVE_TYPES_DEBUGGER_SERVER = {
  serverInfo: {
    name: "primitive_types_debugger",
    version: "1.0.0",
    description:
      "Demo server showing a basic interaction with various configurable blocks.",
    icon: "ActionEmotionLaughIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;

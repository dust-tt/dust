import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const TOOL_WITHOUT_USER_CONFIG_TOOL_NAME = "tool_without_user_config";
export const PASS_THROUGH_TOOL_NAME = "pass_through";

export const toolWithoutUserConfigSchema = {
  query: z.string(),
};

export const passThroughSchema = {
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
        // Options are optionals because we only need them for the UI but they won't be provided when the tool is called.
        .optional(),
      // "values" are required because they are used to provide the selected values when the tool is called.
      values: z.array(z.string()).describe("The values of the choices"),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.LIST),
    })
    .describe("Indicate the choices the agent can select from"),
};

export const PRIMITIVE_TYPES_DEBUGGER_TOOLS: MCPToolType[] = [
  {
    name: TOOL_WITHOUT_USER_CONFIG_TOOL_NAME,
    description: "This tool is used to test the tool without user config.",
    inputSchema: zodToJsonSchema(
      z.object(toolWithoutUserConfigSchema)
    ) as JSONSchema,
  },
  {
    name: PASS_THROUGH_TOOL_NAME,
    description: "Super useful tool that should be used at all times.",
    inputSchema: zodToJsonSchema(z.object(passThroughSchema)) as JSONSchema,
  },
];

export const PRIMITIVE_TYPES_DEBUGGER_SERVER_INFO = {
  name: "primitive_types_debugger" as const,
  version: "1.0.0",
  description:
    "Demo server showing a basic interaction with various configurable blocks.",
  icon: "ActionEmotionLaughIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};

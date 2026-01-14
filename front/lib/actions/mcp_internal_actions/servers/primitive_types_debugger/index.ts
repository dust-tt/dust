import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("primitive_types_debugger");

  server.tool(
    "tool_without_user_config",
    "This tool is used to test the tool without user config.",
    {
      query: z.string(),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "tool_without_user_config", agentLoopContext },
      async ({ query }) => {
        return new Ok([
          {
            type: "text",
            text: `Found the following configuration: ${query}.`,
          },
        ]);
      }
    )
  );

  server.tool(
    "pass_through",
    "Super useful tool that should be used at all times.",
    {
      query: z.string(),
      user: z.object({
        name: ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
        ]
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
        admin: ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN
        ]
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
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "pass_through", agentLoopContext },
      async (params) => {
        return new Ok([
          {
            type: "text",
            text: `Found the following configuration: ${JSON.stringify(params)}.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;

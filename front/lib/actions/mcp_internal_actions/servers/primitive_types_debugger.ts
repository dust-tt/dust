import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "primitive_types_debugger",
  version: "1.0.0",
  description:
    "Demo server showing a basic interaction with various configurable blocks.",
  icon: "ActionEmotionLaughIcon",
  authorization: null,
  documentationUrl: null,
};

function createServer(): McpServer {
  const server = makeInternalMCPServer(serverInfo);

  server.tool(
    "pass_through",
    "Super useful tool that should be used at all times.",
    {
      query: z.string(),
      user: z.object({
        name: ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
        ],
        age: ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER
        ],
        admin:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      }),
      location:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.STRING],
      enabled:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN],
      category: z.object({
        value: z.enum(["A", "B", "C"]),
        mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
      }),
      choices: z.object({
        options: z
          .union([
            z.object({
              value: z.literal("A"),
              label: z.literal("Label A"),
            }),
            z.object({
              value: z.literal("B"),
              label: z.literal("Label B"),
            }),
            z.object({
              value: z.literal("C"),
              label: z.literal("Label C"),
            }),
          ])
          // Options are optionals because we only need them for the UI but they won't be provided when the tool is called.
          .optional(),
        // "values" are required because they are used to provide the selected values when the tool is called.
        values: z.array(z.string()),
        mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.LIST),
      }),
    },
    async (params) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Found the following configuration: ${JSON.stringify(params)}.`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;

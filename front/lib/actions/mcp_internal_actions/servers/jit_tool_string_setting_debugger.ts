import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

function createServer(): McpServer {
  const server = makeInternalMCPServer("jit_tool_string_setting_debugger");

  server.tool(
    "echo_with_config",
    "Echo back the provided message along with a configurable setting.",
    {
      message: z.string().describe("Message to echo back"),
      setting: ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.STRING]
        .describe("A configurable setting included in the response")
        .default({
          value: "default_setting_value",
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
        }),
    },
    async ({ message, setting }) => {
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${message} | Setting: ${
              typeof setting === "string" ? setting : setting.value
            }`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;



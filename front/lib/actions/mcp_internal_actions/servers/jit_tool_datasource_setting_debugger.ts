import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

function createServer(): McpServer {
  const server = makeInternalMCPServer("jit_tool_datasource_setting_debugger");

  server.tool(
    "echo_with_config",
    "Echo back the provided message along with configurable settings, including datasources.",
    {
      message: z.string().describe("Message to echo back"),
      datasources: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
      ]
        .describe("Optional list of datasources to use.")
        .default([]),
    },
    async ({ message, datasources }) => {
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${message} | Setting: ${
              typeof datasources === "string" ? datasources : datasources.values
            } | Datasources: ${Array.isArray(datasources) ? datasources.length : 0}`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;



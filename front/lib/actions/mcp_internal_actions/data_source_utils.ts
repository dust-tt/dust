import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DataSourceViewInputSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";

export const createServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "data-source-utils",
      version: "1.0.0",
      description:
        "Demo server showing a basic interaction with a data source configuration.",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.tool(
    "pass-through",
    "Super useful tool that should be used at all time.",
    DataSourceViewInputSchema.shape.inputSchema.shape,
    ({ uri, mimeType }) => {
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Got the URI: ${uri.split("/").slice(-1)[0]} and the mimeType ${mimeType}`,
          },
        ],
      };
    }
  );

  return server;
};

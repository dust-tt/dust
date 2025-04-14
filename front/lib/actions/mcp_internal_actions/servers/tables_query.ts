import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "tables_query",
  version: "1.0.0",
  description:
    "The agent will generate a SQL query from your request, execute it on the tables selected and use the results to generate an answer.",
  visual: "https://dust.tt/static/droidavatar/Droid_Sky_5.jpg",
  authorization: null,
};

function createServer(description?: string): McpServer {
  const server = new McpServer(serverInfo);

  let actionDescription =
    "Query data tables described below by executing a SQL query automatically generated from the conversation context. " +
    "The function does not require any inputs, the SQL query will be inferred from the conversation history.";
  if (description) {
    actionDescription += `\nDescription of the data tables:\n${description}`;
  }

  server.tool(
    "tables_query",
    actionDescription,
    {
      query: z.string(),
      tables:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.CONFIGURATION.TABLE],
    },
    async ({ tables }) => {
      return {
        isError: false,
        content: tables.map(({ uri }) => ({
          type: "text",
          text: `Got table at URI: ${uri}`,
        })),
      };
    }
  );

  return server;
}

export default createServer;

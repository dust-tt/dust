import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "primitive_types_debugger",
  version: "1.0.0",
  description:
    "Demo server showing a basic interaction with various configurable blocks.",
  visual: "table",
  authorization: null,
};

function createServer(): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "pass_through",
    "Super useful tool that should be used at all times.",
    {
      query: z.string(),
      user: z.object({
        first_name:
          ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN
          ],
        last_name:
          ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.CONFIGURATION.STRING
          ],
        age: ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER
        ],
        admin:
          ConfigurableToolInputSchemas[
            INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN
          ],
      }),
      location:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.CONFIGURATION.STRING],
      enabled:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN],
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

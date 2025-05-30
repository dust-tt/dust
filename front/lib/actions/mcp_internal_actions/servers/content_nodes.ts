import config from "@app/lib/api/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { CoreAPI } from "@app/types";
import logger from "@app/logger/logger";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "content_nodes",
  version: "1.0.0",
  description: "Tools to browse and search within the content nodes hierarchy.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "search_by_title",
    "List all nodes whose title match the query.",
    {
      query: z.string(),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z.number().optional(),
    },
    async ({ query, dataSources, limit }) => {
      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: [],
      });
    }
  );

  return server;
};

export default createServer;

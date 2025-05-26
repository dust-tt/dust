import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import jsforce from "jsforce";
import { z } from "zod";

import { getConnectionForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "salesforce",
  version: "1.0.0",
  description: "Salesforce tools.",
  authorization: {
    provider: "salesforce" as const,
    use_case: "personal_actions" as const,
  },
  icon: "SalesforceLogo",
};

const SF_API_VERSION = "57.0";

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions:
      "You have access to the following tools: execute_query. " +
      "You can use it to execute SOQL queries on Salesforce. " +
      "Queries can be used to retrieve data or to discover data.",
  });

  server.tool(
    "execute_query",
    "Execute a query on Salesforce",
    {
      query: z.string().describe("The SOQL query to execute"),
    },
    async ({ query }) => {
      const connection = await getConnectionForInternalMCPServer(auth, {
        mcpServerId,
        connectionType: "personal",
      });
      const accessToken = connection?.access_token;
      const instanceUrl = connection?.connection.metadata.instance_url as
        | string
        | undefined;

      if (!accessToken || !instanceUrl) {
        return makeMCPToolTextError("No access token or instance URL found");
      }

      const conn = new jsforce.Connection({
        instanceUrl,
        accessToken,
        version: SF_API_VERSION,
      });
      await conn.identity();

      const result = await conn.query(query);

      return makeMCPToolJSONSuccess({
        message: "Operation completed successfully",
        result: result,
      });
    }
  );

  return server;
};

export default createServer;

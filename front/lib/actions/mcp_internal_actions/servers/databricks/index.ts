import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  listWarehouses,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/databricks/databricks_api_helper";
import {
  DATABRICKS_TOOL_NAME,
  listWarehousesSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/databricks/metadata";
import { renderWarehouse } from "@app/lib/actions/mcp_internal_actions/servers/databricks/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(DATABRICKS_TOOL_NAME);

  server.tool(
    "list_warehouses",
    "List all SQL warehouses available in the Databricks workspace.",
    listWarehousesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DATABRICKS_TOOL_NAME,
        agentLoopContext,
      },
      async (_params, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, workspaceUrl) => {
            const result = await listWarehouses(accessToken, workspaceUrl);

            if (result.isErr()) {
              return result;
            }

            const warehouses = result.value;

            if (warehouses.length === 0) {
              return new Ok([
                { type: "text", text: "No SQL warehouses found." },
              ]);
            }

            let text = `Found ${warehouses.length} SQL warehouse(s):\n\n`;
            for (const warehouse of warehouses) {
              text += renderWarehouse(warehouse);
            }

            return new Ok([{ type: "text", text }]);
          },
        });
      }
    )
  );

  return server;
}

export default createServer;

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types";

import { withAuth } from "./databricks_api_helper";
import { listWarehouses } from "./databricks_api_helper";
import { renderWarehouse } from "./rendering";

const DATABRICKS_TOOL_NAME = "databricks";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("databricks");

  server.tool(
    "list_warehouses",
    "List all SQL warehouses available in the Databricks workspace.",
    {},
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
            try {
              const result = await listWarehouses(accessToken, workspaceUrl);

              if (result.isErr()) {
                return new Err(new MCPError(result.error));
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
            } catch (error: unknown) {
              return new Err(
                new MCPError(
                  `Failed to list warehouses: ${normalizeError(error).message}`
                )
              );
            }
          },
        });
      }
    )
  );

  return server;
}

export default createServer;

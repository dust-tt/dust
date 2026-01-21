import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  renderCurrentEmployee,
  renderPTORequests,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/rendering";
import {
  getAllPTORequests,
  getCurrentEmployee,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/ukg_ready_api_helper";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const UKG_READY_TOOL_LOG_NAME = "ukg_ready";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ukg_ready");

  server.tool(
    "get_my_info",
    "Get your own employee information from UKG Ready, including your employee ID, name, department, and job title.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async (_args, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getCurrentEmployee(
              accessToken,
              instanceUrl,
              companyId
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              {
                type: "text" as const,
                text: renderCurrentEmployee(result.value),
              },
            ]);
          },
        });
      }
    )
  );

  server.tool(
    "get_my_pto_requests",
    "Get your PTO/time-off requests. Can filter by date range.",
    {
      fromDate: z
        .string()
        .optional()
        .describe("Filter requests starting from this date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .optional()
        .describe("Filter requests ending before this date (YYYY-MM-DD)"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UKG_READY_TOOL_LOG_NAME,
        agentLoopContext,
      },
      async ({ fromDate, toDate }, { authInfo }) => {
        return withAuth({
          authInfo,
          action: async (accessToken, instanceUrl, companyId) => {
            const result = await getAllPTORequests(
              accessToken,
              instanceUrl,
              companyId,
              {
                fromDate,
                toDate,
              }
            );

            if (result.isErr()) {
              return new Err(new MCPError(result.error));
            }

            return new Ok([
              { type: "text" as const, text: renderPTORequests(result.value) },
            ]);
          },
        });
      }
    )
  );

  return server;
}

export default createServer;

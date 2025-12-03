import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types";

import { vantaGet } from "./api";
import { renderTests, VantaTestsResponseSchema } from "./renderers";

const ListTestsInput = z.object({
  statusFilter: z
    .enum([
      "OK",
      "DEACTIVATED",
      "NEEDS_ATTENTION",
      "IN_PROGRESS",
      "INVALID",
      "NOT_APPLICABLE",
    ])
    .describe(
      "Filter tests by status. Possible values: OK (Test passed), DEACTIVATED (Test deactivated), NEEDS_ATTENTION (Test failed), IN_PROGRESS (Test in progress), INVALID (Test invalid), NOT_APPLICABLE (Test not applicable)."
    )
    .optional(),
  categoryFilter: z
    .enum([
      "ACCOUNTS_ACCESS",
      "ACCOUNT_SECURITY",
      "ACCOUNT_SETUP",
      "COMPUTERS",
      "CUSTOM",
      "DATA_STORAGE",
      "EMPLOYEES",
      "INFRASTRUCTURE",
      "IT",
      "LOGGING",
      "MONITORING_ALERTS",
      "PEOPLE",
      "POLICIES",
      "RISK_ANALYSIS",
      "SECURITY_ALERT_MANAGEMENT",
      "SOFTWARE_DEVELOPMENT",
      "VENDORS",
      "VULNERABILITY_MANAGEMENT",
    ])
    .describe("Filter tests by category.")
    .optional(),
  frameworkFilter: z
    .string()
    .describe("Filter tests by framework ID.")
    .optional(),
  integrationFilter: z
    .string()
    .describe("Filter tests by integration ID.")
    .optional(),
  pageSize: z
    .number()
    .min(1)
    .max(100)
    .describe(
      "Maximum number of results to return per page (1-100). Default is 10."
    )
    .optional(),
  pageCursor: z
    .string()
    .describe(
      "Pagination cursor from a previous response. Leave blank to start from the first page."
    )
    .optional(),
});

export default function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("vanta");

  server.tool(
    "list_tests",
    "List Vanta's automated security and compliance tests with optional filtering",
    ListTestsInput.shape,
    withToolLogging<z.infer<typeof ListTestsInput>>(
      auth,
      {
        toolNameForMonitoring: "vanta_list_tests",
        agentLoopContext,
      },
      async (params, { authInfo }) => {
        const query = buildQuery(params);

        const result = await vantaGet({
          path: "/v1/tests",
          schema: VantaTestsResponseSchema,
          query,
          authInfo,
        });

        if (result.isErr()) {
          return result;
        }

        const text = renderTests(result.value);

        return new Ok([{ type: "text" as const, text }]);
      }
    )
  );

  return server;
}

function buildQuery(
  params: Record<string, unknown>
): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return;
      }
      query[key] = value.join(",");
      return;
    }
    query[key] = typeof value === "string" ? value : String(value);
  });

  return Object.keys(query).length ? query : undefined;
}

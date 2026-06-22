import config from "@app/lib/api/config";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import { listPodsForScope } from "@app/lib/api/projects/list";
import { getPodRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const inputSchema = {
  access: z
    .enum(["member", "open"])
    .default("member")
    .optional()
    .describe(
      "Pod access filter: member = Pods you belong to (default); open = all open Pods in the workspace."
    ),
  q: z
    .string()
    .optional()
    .describe(
      "Optional case-insensitive substring filter on Pod name (diacritics ignored)."
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe(
      "Maximum number of Pods to return per call (default: 20, max: 100)."
    ),
  lastValue: z
    .string()
    .optional()
    .describe(
      "Cursor from a previous response's lastValue field for the next page."
    ),
};

export function registerPodsListTool(server: McpServer) {
  registerDustMcpTool(
    server,
    "list_pods",
    {
      description:
        "List non-archived Pods (20 per page by default). Defaults to Pods where you are a member (access='member'). " +
        "Use access='open' to list all open Pods in the workspace. Supports cursor pagination via lastValue.",
      inputSchema,
    },
    async (auth, { access = "member", q, limit = 20, lastValue }) => {
      const owner = auth.getNonNullableWorkspace();
      const workspaceSId = owner.sId;

      const decodedPageOffset = lastValue ? Number.parseInt(lastValue, 10) : 0;
      const pageOffset =
        Number.isInteger(decodedPageOffset) && decodedPageOffset >= 0
          ? decodedPageOffset
          : null;

      if (pageOffset === null) {
        return mcpError(
          "Invalid lastValue. Expected a pagination cursor from a previous list_pods response."
        );
      }

      const {
        pods: pagePods,
        total,
        hasMore,
      } = await listPodsForScope(auth, {
        access,
        q,
        pagination: { limit, pageOffset },
      });

      const nextLastValue = hasMore
        ? String(pageOffset + pagePods.length)
        : null;

      const pods = pagePods.map((pod) => ({
        id: pod.sId,
        name: pod.name,
        url: `${config.getAppUrl()}${getPodRoute(workspaceSId, pod.sId)}`,
      }));

      return mcpJsonResponse({
        count: pods.length,
        total,
        hasMore,
        lastValue: nextLastValue,
        access,
        q: q ?? null,
        pods,
      });
    }
  );
}

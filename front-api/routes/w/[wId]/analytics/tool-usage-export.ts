import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchAvailableTools,
  fetchToolUsageMetrics,
  resolveToolDisplayNames,
} from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { stringify } from "csv-stringify/sync";
import { Hono } from "hono";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

interface ToolUsageExportRow {
  date: string;
  toolName: string;
  executions: number;
  uniqueUsers: number;
}

// Mounted at /api/w/:wId/analytics/tool-usage-export.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const toolsResult = await fetchAvailableTools(baseQuery);
  if (toolsResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve available tools: ${toolsResult.error.message}`,
      },
    });
  }

  const tools = await resolveToolDisplayNames(auth, toolsResult.value);
  const rows: ToolUsageExportRow[] = [];

  for (const tool of tools) {
    const usageResult = await fetchToolUsageMetrics(baseQuery, tool.serverName);
    if (usageResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve tool usage for ${tool.serverName}: ${usageResult.error.message}`,
        },
      });
    }

    for (const point of usageResult.value) {
      rows.push({
        date: point.date,
        toolName: tool.displayName,
        executions: point.executionCount,
        uniqueUsers: point.uniqueUsers,
      });
    }
  }

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.toolName.localeCompare(b.toolName);
  });

  const headers: (keyof ToolUsageExportRow)[] = [
    "date",
    "toolName",
    "executions",
    "uniqueUsers",
  ];
  const csvData = rows.map((row) => headers.map((h) => row[h]));
  const csv = stringify([headers, ...csvData], { header: false });

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_tool_usage_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

/** @ignoreswagger */
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchAvailableTools,
  fetchToolUsageMetrics,
} from "@app/lib/api/assistant/observability/tool_usage";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { stringify } from "csv-stringify/sync";
import type { NextApiRequest, NextApiResponse } from "next";
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
) {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { days } = req.query;
      const q = QuerySchema.safeParse({ days });
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${q.error.message}`,
          },
        });
      }

      const owner = auth.getNonNullableWorkspace();
      const baseQuery = buildAgentAnalyticsBaseQuery({
        workspaceId: owner.sId,
        days: q.data.days,
      });

      const toolsResult = await fetchAvailableTools(baseQuery);
      if (toolsResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve available tools: ${toolsResult.error.message}`,
          },
        });
      }

      const tools = toolsResult.value;
      const rows: ToolUsageExportRow[] = [];

      for (const tool of tools) {
        const usageResult = await fetchToolUsageMetrics(
          baseQuery,
          tool.serverName
        );
        if (usageResult.isErr()) {
          return apiError(req, res, {
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
            toolName: tool.serverName,
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

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_tool_usage_last_${q.data.days}_days.csv"`
      );
      return res.status(200).send(csv);
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

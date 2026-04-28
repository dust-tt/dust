/**
 * @swagger
 * /api/v1/w/{wId}/analytics/export:
 *   get:
 *     summary: Export workspace analytics
 *     description: Export analytics data for the workspace identified by {wId} in CSV or JSON format.
 *     tags:
 *       - Workspace
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: table
 *         required: true
 *         description: |
 *           The analytics table to export:
 *           - "usage_metrics": Messages, conversations, and active users over time.
 *           - "active_users": Daily, weekly, and monthly active user counts.
 *           - "source": Message volume by context origin (web, slack, etc.).
 *           - "agents": Top agents by message count.
 *           - "users": Top users by message count.
 *           - "skill_usage": Skill executions and unique users over time.
 *           - "tool_usage": Tool executions and unique users over time.
 *           - "messages": Detailed message-level logs.
 *         schema:
 *           type: string
 *           enum: [usage_metrics, active_users, source, agents, users, skill_usage, tool_usage, messages]
 *       - in: query
 *         name: startDate
 *         required: true
 *         description: Start date in YYYY-MM-DD format
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         description: End date in YYYY-MM-DD format
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: timezone
 *         required: false
 *         description: IANA timezone name (defaults to UTC)
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         required: false
 *         description: Output format (defaults to csv)
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *     responses:
 *       200:
 *         description: The analytics data in CSV or JSON format
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Invalid request query parameters
 *       403:
 *         description: Requires an API key with admin scope
 *       405:
 *         description: Method not supported
 */

import type { ExportTableData } from "@app/lib/api/analytics/export_tables";
import {
  exportTable,
  stringifyExportTableAsCsv,
} from "@app/lib/api/analytics/export_tables";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { GetAnalyticsExportRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string | ExportTableData["rows"]>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Workspace analytics export requires API key authentication.",
      },
    });
  }
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "insufficient_key_scope",
        message:
          "Workspace analytics export requires an API key with admin scope.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { table, startDate, endDate, timezone, format } = req.query;
      const q = GetAnalyticsExportRequestSchema.safeParse({
        table,
        startDate,
        endDate,
        timezone,
        format,
      });
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
      const result = await exportTable({
        table: q.data.table,
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: q.data.timezone ?? "UTC",
        owner,
        includeHiddenAgents: auth.isKey(),
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      if (q.data.format === "json") {
        res.setHeader("Content-Type", "application/json");
        return res.status(200).json(result.value.rows);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_${q.data.table}_${q.data.startDate}_${q.data.endDate}.csv"`
      );
      return res.status(200).send(stringifyExportTableAsCsv(result.value));
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

export default withPublicAPIAuthentication(handler);

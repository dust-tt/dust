/**
 * @swagger
 * /api/v1/w/{wId}/analytics/export:
 *   get:
 *     summary: Export workspace analytics as CSV
 *     description: Export analytics data for the workspace identified by {wId} in CSV format.
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
 *     responses:
 *       200:
 *         description: The analytics data in CSV format
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request query parameters
 *       403:
 *         description: Requires an API key with at least builder role
 *       405:
 *         description: Method not supported
 */

import { exportTable } from "@app/lib/api/analytics/export_tables";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { GetAnalyticsExportRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isKey() || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Requires an API key with at least builder role to access workspace analytics.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { table, startDate, endDate, timezone } = req.query;
      const q = GetAnalyticsExportRequestSchema.safeParse({
        table,
        startDate,
        endDate,
        timezone,
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
      const csv = await exportTable({
        table: q.data.table,
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: q.data.timezone ?? "UTC",
        owner,
      });

      if (csv.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: csv.error.message,
          },
        });
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="dust_${q.data.table}_${q.data.startDate}_${q.data.endDate}.csv"`
      );
      return res.status(200).send(csv.value);
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

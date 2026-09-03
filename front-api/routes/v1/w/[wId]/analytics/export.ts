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
 *           - "agents": Top agents by message count, including credits.
 *           - "users": Top users by message count, including credits, last login date and membership status (active, revoked, unregistered).
 *           - "skills": Skill metadata catalog.
 *           - "skill_usage": Skill executions and unique users over time.
 *           - "tool_usage": Tool executions and unique users over time.
 *           - "messages": Detailed message-level logs, including comma-separated lists of tools (as "server__tool") and skills used per message, and the cost in credits of each message.
 *           - "feedback": Detailed message-level feedback (thumbs, content, conversation URL).
 *         schema:
 *           type: string
 *           enum: [usage_metrics, active_users, source, agents, users, skills, skill_usage, tool_usage, messages, feedback]
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
 */

import {
  exportTable,
  stringifyExportTableAsCsv,
} from "@app/lib/api/analytics/export_tables";
import logger from "@app/logger/logger";
import { GetAnalyticsExportRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/v1/w/:wId/analytics/export. publicApiAuth is applied by the
// parent v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.get("/", ensureIsAdmin(), async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isKey()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Workspace analytics export requires API key authentication.",
      },
    });
  }

  const q = GetAnalyticsExportRequestSchema.safeParse({
    table: ctx.req.query("table"),
    startDate: ctx.req.query("startDate"),
    endDate: ctx.req.query("endDate"),
    timezone: ctx.req.query("timezone"),
    format: ctx.req.query("format"),
  });
  if (!q.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${q.error.message}`,
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  logger.info(
    {
      workspaceId: owner.sId,
      table: q.data.table,
      startDate: q.data.startDate,
      endDate: q.data.endDate,
      timezone: q.data.timezone ?? "UTC",
      format: q.data.format ?? "csv",
    },
    "Analytics export requested."
  );

  const result = await exportTable({
    auth,
    table: q.data.table,
    startDate: q.data.startDate,
    endDate: q.data.endDate,
    timezone: q.data.timezone ?? "UTC",
    owner,
    includeHiddenAgents: auth.isKey(),
  });

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  if (q.data.format === "json") {
    return ctx.json(result.value.rows);
  }

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_${q.data.table}_${q.data.startDate}_${q.data.endDate}.csv"`
  );
  return ctx.body(stringifyExportTableAsCsv(result.value));
});

// Hono does not emit 405 for a matched path with an unsupported method, so we
// register an explicit fallback to preserve the Next handler's behavior.
app.all("/", (ctx) =>
  apiError(ctx, {
    status_code: 405,
    api_error: {
      type: "method_not_supported_error",
      message: "The method passed is not supported, GET is expected.",
    },
  })
);

export default app;

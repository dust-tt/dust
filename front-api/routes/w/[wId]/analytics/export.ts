import {
  exportTable,
  stringifyExportTableAsCsv,
} from "@app/lib/api/analytics/export_tables";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Session-authed sibling of the public /api/v1/w/:wId/analytics/export
// endpoint. It shares the same query contract, but files outside routes/v1/
// cannot import the schema from @dust-tt/client, so it is redeclared here.
const AnalyticsDateSchema = z
  .string()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    "Date must be in YYYY-MM-DD format"
  );

const QuerySchema = z
  .object({
    table: z.enum([
      "usage_metrics",
      "active_users",
      "source",
      "agents",
      "users",
      "skills",
      "skill_usage",
      "tool_usage",
      "messages",
      "feedback",
    ]),
    startDate: AnalyticsDateSchema,
    endDate: AnalyticsDateSchema,
    timezone: z.string().optional(),
    format: z.enum(["csv", "json"]).optional(),
  })
  .refine((d) => d.startDate <= d.endDate, {
    message: "startDate must be before or equal to endDate",
  });

// Mounted at /api/w/:wId/analytics/export. Same export logic (exportTable) as
// the public endpoint, reachable from the workspace analytics page without an
// API key. workspaceAuth is applied by the parent workspace sub-app.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { table, startDate, endDate, timezone, format } =
    ctx.req.valid("query");

  const owner = auth.getNonNullableWorkspace();
  const result = await exportTable({
    auth,
    table,
    startDate,
    endDate,
    timezone: timezone ?? "UTC",
    owner,
    includeHiddenAgents: false,
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

  void emitAuditLogEvent({
    auth,
    action: "analytics.export_downloaded",
    targets: [buildAuditLogTarget("workspace", owner)],
    context: getAuditLogContext(auth),
    metadata: { table, period: `${startDate}:${endDate}` },
  });

  if (format === "json") {
    return ctx.json(result.value.rows);
  }

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_${table}_${startDate}_${endDate}.csv"`
  );
  return ctx.body(stringifyExportTableAsCsv(result.value));
});

export default app;

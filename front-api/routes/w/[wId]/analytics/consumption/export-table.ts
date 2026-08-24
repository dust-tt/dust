import {
  fetchConsumptionDimensionExportRows,
  stringifyConsumptionExportTableAsCsv,
} from "@app/lib/api/analytics/consumption/export_table";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTableExportBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/analytics/consumption/export-table. Powers the
// "Export data" panel: a single dimension's attribution ranking, exported as
// a CSV, for the currently selected period and filter.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionTableExportBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { dimension, filter, ...periodQuery } = ctx.req.valid("json");
    const owner = auth.getNonNullableWorkspace();

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionDimensionExportRows(auth, {
      dimension,
      period,
      filter,
    });

    if (result.isErr()) {
      logger.error(
        { workspaceId: owner.sId, dimension, err: result.error },
        "[ConsumptionAnalytics] Failed to export table."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to export table.",
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "analytics.export_downloaded",
      targets: [buildAuditLogTarget("workspace", owner)],
      context: getAuditLogContext(auth),
      metadata: {
        table: dimension,
        period:
          periodQuery.period === "cycle" ? "cycle" : `${periodQuery.days}d`,
      },
    });

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_consumption_${dimension}_${period.startDate}_${period.endDate}.csv"`
    );
    return ctx.body(stringifyConsumptionExportTableAsCsv(result.value));
  }
);

export default app;

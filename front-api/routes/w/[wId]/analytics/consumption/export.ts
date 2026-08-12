import { fetchConsumptionTopExportCsv } from "@app/lib/api/analytics/consumption/export";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionExportBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/analytics/consumption/export.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionExportBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { dimension, filter, ...periodQuery } = ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopExportCsv(auth, {
      dimension,
      period,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to export attribution."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to export consumption attribution.",
        },
      });
    }

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_consumption_${dimension}.csv"`
    );
    return ctx.body(result.value);
  }
);

export default app;

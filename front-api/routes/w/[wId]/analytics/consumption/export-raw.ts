import { fetchConsumptionLinesExportZip } from "@app/lib/api/analytics/consumption/export_lines";
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

// Mounted at /api/w/:wId/analytics/consumption/export-raw.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionExportBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const { filter, ...periodQuery } = ctx.req.valid("json");
    const periodInput = toConsumptionPeriodInput(periodQuery);

    const period = await resolveConsumptionPeriod(auth, periodInput);

    const result = await fetchConsumptionLinesExportZip(auth, {
      period,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        { workspaceId, err: result.error },
        "[ConsumptionAnalytics] Failed to export raw consumption lines."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to export consumption lines.",
        },
      });
    }

    // `Buffer` doesn't structurally match the `Uint8Array<ArrayBuffer>` that
    // `ctx.body` expects, so return a raw `Response` instead.
    return new Response(new Uint8Array(result.value), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dust_consumption_lines_export_${workspaceId}.zip"`,
      },
    });
  }
);

export default app;

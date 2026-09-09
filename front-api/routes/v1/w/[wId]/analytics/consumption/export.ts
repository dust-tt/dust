/** @ignoreswagger */

import {
  fetchConsumptionExportRows,
  rowsToCsvString,
  rowsToNdjson,
} from "@app/lib/api/analytics/consumption/export_lines";
import logger from "@app/logger/logger";
import { PostConsumptionExportRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/v1/w/:wId/analytics/consumption/export.
const app = publicApiApp();

// No swagger doc while this endpoint is under feature flag.
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostConsumptionExportRequestSchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    if (!(await auth.hasFeatureFlag("consumption_export_api"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "The workspace does not have access to the consumption export API.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const format = body.format ?? "csv";

    const startDate = new Date(body.startDate).toISOString();
    const endDate = new Date(body.endDate).toISOString();

    const owner = auth.getNonNullableWorkspace();

    logger.info(
      {
        workspaceId: owner.sId,
        startDate,
        endDate,
        format,
        hasFilter: !!body.filter,
      },
      "Consumption export requested."
    );

    const result = await fetchConsumptionExportRows(auth, {
      period: { startDate, endDate },
      filter: body.filter,
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

    if (format === "ndjson") {
      ctx.header("Content-Type", "application/x-ndjson");
      ctx.header(
        "Content-Disposition",
        `attachment; filename="dust_consumption_${body.startDate}_${body.endDate}.ndjson"`
      );
      return ctx.body(rowsToNdjson(result.value));
    }

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_consumption_${body.startDate}_${body.endDate}.csv"`
    );
    return ctx.body(rowsToCsvString(result.value));
  }
);

app.all("/", (ctx) =>
  apiError(ctx, {
    status_code: 405,
    api_error: {
      type: "method_not_supported_error",
      message: "The method passed is not supported, POST is expected.",
    },
  })
);

export default app;

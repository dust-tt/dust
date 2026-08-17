import {
  getConsumptionExportDownloadUrl,
  isConsumptionExportGenerating,
  listConsumptionExports,
  startConsumptionExport,
} from "@app/lib/api/analytics/consumption/export_jobs";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionExportBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Mounted at /api/w/:wId/analytics/consumption/export-raw.
const app = workspaceApp();

const DownloadParamsSchema = z.object({
  name: z.string(),
});

/** @ignoreswagger */
app.get("/", ensureIsManager(), async (ctx) => {
  const auth = ctx.get("auth");

  const [exports, isGenerating] = await Promise.all([
    listConsumptionExports(auth),
    isConsumptionExportGenerating(auth),
  ]);

  return ctx.json({ exports, isGenerating });
});

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionExportBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { filter, ...periodQuery } = ctx.req.valid("json");
    const periodInput = toConsumptionPeriodInput(periodQuery);

    const period = await resolveConsumptionPeriod(auth, periodInput);

    const result = await startConsumptionExport(auth, { period, filter });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to start consumption export: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ isGenerating: true }, 202);
  }
);

/** @ignoreswagger */
app.get(
  "/:name/download",
  ensureIsManager(),
  validate("param", DownloadParamsSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { name } = ctx.req.valid("param");

    const result = await getConsumptionExportDownloadUrl(auth, name);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "Export not found.",
        },
      });
    }

    return ctx.redirect(result.value);
  }
);

export default app;

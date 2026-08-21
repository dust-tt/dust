import {
  getConsumptionExportDownloadUrl,
  getConsumptionExportListItem,
  getConsumptionExportStatus,
  listConsumptionExports,
  startConsumptionExport,
} from "@app/lib/api/analytics/consumption/export_jobs";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionExportBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { consumptionAnalyticsApp } from "./context";

const DownloadParamsSchema = z.object({
  name: z.string(),
});

const app = consumptionAnalyticsApp();

// POST (not GET) so the filter travels in the JSON body, consistent with every other
// consumption endpoint: it scopes isGenerating/isReady to this exact period+filter
// combination instead of any export running for the workspace.
/** @ignoreswagger */
app.post(
  "/status",
  validate("json", ConsumptionExportBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const requiredFilter = ctx.get("consumptionRequiredFilter");
    const body = ctx.req.valid("json");

    const periodInput = toConsumptionPeriodInput(body);

    const period = await resolveConsumptionPeriod(auth, periodInput);
    const status = await getConsumptionExportStatus(auth, {
      period,
      filter: requiredFilter
        ? { ...body.filter, ...requiredFilter }
        : body.filter,
    });

    const exports = requiredFilter
      ? status.isReady
        ? [await getConsumptionExportListItem(auth, status.exportId)]
        : []
      : await listConsumptionExports(auth);

    return ctx.json({ exports, ...status });
  }
);

/** @ignoreswagger */
app.post("/", validate("json", ConsumptionExportBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const requiredFilter = ctx.get("consumptionRequiredFilter");
  const body = ctx.req.valid("json");

  const periodInput = toConsumptionPeriodInput(body);

  const period = await resolveConsumptionPeriod(auth, periodInput);

  const result = await startConsumptionExport(auth, {
    period,
    filter: requiredFilter
      ? { ...body.filter, ...requiredFilter }
      : body.filter,
  });

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to start consumption export: ${result.error.message}`,
      },
    });
  }

  // Already generated for this exact period+filter: nothing was (re)triggered, so the
  // caller can go straight to downloading it instead of switching into a "generating" state.
  if (result.value.status === "cached") {
    const { gcsPath } = result.value;
    const name = gcsPath.split("/").pop() ?? gcsPath;
    let downloadUrl: string | undefined;
    if (requiredFilter) {
      const downloadUrlResult = await getConsumptionExportDownloadUrl(
        auth,
        name
      );
      if (downloadUrlResult.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to generate the export download URL.",
          },
        });
      }
      downloadUrl = downloadUrlResult.value;
    }
    return ctx.json({
      isGenerating: false,
      name,
      ...(downloadUrl ? { downloadUrl } : {}),
    });
  }

  return ctx.json({ isGenerating: true }, 202);
});

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

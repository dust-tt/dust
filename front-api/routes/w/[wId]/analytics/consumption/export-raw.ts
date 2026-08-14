import {
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
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/analytics/consumption/export-raw.
const app = workspaceApp();

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

    await startConsumptionExport(auth, { period, filter });

    return ctx.json({ isGenerating: true }, 202);
  }
);

export default app;

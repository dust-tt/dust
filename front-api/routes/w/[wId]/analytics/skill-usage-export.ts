import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildDaysConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/period";
import { fetchSkillUsageExportRows } from "@app/lib/api/analytics/skill_usage_export";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/skill-usage-export.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days } = ctx.req.valid("query");

  const baseQuery = await buildDaysConsumptionScopeQuery(auth, days);

  const result = await fetchSkillUsageExportRows(auth, baseQuery, "UTC");
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve skill usage: ${result.error.message}`,
      },
    });
  }

  const headers = ["date", "skillName", "executions", "uniqueUsers"] as const;
  const csvData = result.value.map((row) => headers.map((h) => row[h]));
  const csv = stringify([headers, ...csvData], { header: false });

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_skill_usage_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

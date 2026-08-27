import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { buildDaysConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/period";
import { fetchContextOriginDailyBreakdown } from "@app/lib/api/assistant/observability/context_origin";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/source-export.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days } = ctx.req.valid("query");

  const baseQuery = await buildDaysConsumptionScopeQuery(auth, days);

  const result = await fetchContextOriginDailyBreakdown(baseQuery);

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve source breakdown: ${result.error.message}`,
      },
    });
  }

  const rows = [...result.value].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.origin.localeCompare(b.origin);
  });

  const headers = ["date", "source", "messageCount"];
  const csvData = rows.map((row) => [row.date, row.origin, row.messageCount]);
  const csv = stringify([headers, ...csvData], { header: false });

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_sources_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

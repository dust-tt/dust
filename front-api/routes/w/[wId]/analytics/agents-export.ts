import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
  toAgentExportCsvRow,
} from "@app/lib/api/analytics/agents_export";
import { buildDaysConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/period";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import { DEFAULT_PERIOD_DAYS } from "@app/lib/api/analytics/observability_constants";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/agents-export.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days } = ctx.req.valid("query");

  const baseQuery = await buildDaysConsumptionScopeQuery(auth, days);

  const result = await fetchAgentExportRows(baseQuery, auth, true);

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve agent analytics: ${result.error.message}`,
      },
    });
  }

  const csv = rowsToCsv(
    AGENT_EXPORT_HEADERS,
    result.value.map(toAgentExportCsvRow)
  );

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_agents_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

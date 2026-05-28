import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import { daysToDateRange } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/active-users-export.
const app = workspaceApp();

app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const { startDate, endDate } = daysToDateRange(days);
  const result = await fetchActiveUsersMetrics(owner, startDate, endDate);

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve active users metrics: ${result.error.message}`,
      },
    });
  }

  const headers = ["date", "dau", "wau", "mau"];
  const csvData = result.value.map((point) => [
    point.date,
    point.dau,
    point.wau,
    point.mau,
  ]);
  const csv = stringify([headers, ...csvData], { header: false });

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_active_users_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

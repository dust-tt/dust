import { stringify } from "csv-stringify/sync";
import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import { daysToDateRange } from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/active-users-export.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only workspace admins can access workspace analytics.",
        },
      },
      403
    );
  }

  const { days } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const { startDate, endDate } = daysToDateRange(days);
  const result = await fetchActiveUsersMetrics(owner, startDate, endDate);

  if (result.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: `Failed to retrieve active users metrics: ${result.error.message}`,
        },
      },
      500
    );
  }

  const headers = ["date", "dau", "wau", "mau"];
  const csvData = result.value.map((point) => [
    point.date,
    point.dau,
    point.wau,
    point.mau,
  ]);
  const csv = stringify([headers, ...csvData], { header: false });

  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="dust_active_users_last_${days}_days.csv"`
  );
  return c.body(csv);
});

export default app;

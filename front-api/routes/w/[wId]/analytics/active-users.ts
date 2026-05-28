import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { ActiveUsersMetricsPoint } from "@app/lib/api/assistant/observability/active_users_metrics";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import {
  daysToDateRange,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  timezone: timezoneSchema,
});

export type GetWorkspaceActiveUsersResponse = {
  points: ActiveUsersMetricsPoint[];
};

// Mounted at /api/w/:wId/analytics/active-users.
const app = workspaceApp();

app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, timezone } = ctx.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const { startDate, endDate } = daysToDateRange(days, timezone);
  const result = await fetchActiveUsersMetrics(
    owner,
    startDate,
    endDate,
    timezone
  );

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve active users metrics: ${result.error.message}`,
      },
    });
  }

  const body: GetWorkspaceActiveUsersResponse = {
    points: result.value,
  };
  return ctx.json(body);
});

export default app;

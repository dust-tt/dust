import { Hono } from "hono";
import { z } from "zod";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import type { ActiveUsersMetricsPoint } from "@app/lib/api/assistant/observability/active_users_metrics";
import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import {
  daysToDateRange,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";

import { validate } from "@front-api/middleware/validator";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  timezone: timezoneSchema,
});

export type GetWorkspaceActiveUsersResponse = {
  points: ActiveUsersMetricsPoint[];
};

// Mounted at /api/w/:wId/analytics/active-users.
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

  const { days, timezone } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const { startDate, endDate } = daysToDateRange(days, timezone);
  const result = await fetchActiveUsersMetrics(
    owner,
    startDate,
    endDate,
    timezone
  );

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

  const body: GetWorkspaceActiveUsersResponse = {
    points: result.value,
  };
  return c.json(body);
});

export default app;

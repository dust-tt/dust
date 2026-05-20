import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchUserExportRows,
  USER_EXPORT_HEADERS,
} from "@app/lib/api/analytics/users_export";
import {
  buildAgentAnalyticsBaseQuery,
  daysToDateRange,
  timezoneSchema,
} from "@app/lib/api/assistant/observability/utils";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { stringify } from "csv-stringify/sync";
import { Hono } from "hono";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/analytics/users-export.
const app = new Hono();

app.get("/", validate("query", QuerySchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  }

  const { days, timezone } = c.req.valid("query");
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
  });

  const { startDate, endDate } = daysToDateRange(days, timezone);

  const result = await fetchUserExportRows({
    baseQuery,
    owner,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    timezone,
  });

  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve user analytics: ${result.error.message}`,
      },
    });
  }

  const csvData = result.value.map((row) =>
    USER_EXPORT_HEADERS.map((h) => row[h])
  );
  const csv = stringify([USER_EXPORT_HEADERS, ...csvData], {
    header: false,
  });

  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="dust_users_last_${days}_days.csv"`
  );
  return c.body(csv);
});

export default app;

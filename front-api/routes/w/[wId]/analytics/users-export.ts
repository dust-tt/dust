import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  fetchUserExportRows,
  USER_EXPORT_HEADERS,
} from "@app/lib/api/analytics/users_export";
import {
  buildAgentAnalyticsBaseQuery,
  daysToDateRange,
} from "@app/lib/api/assistant/observability/utils";
import { timezoneSchema } from "@app/lib/api/timezone";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  timezone: timezoneSchema,
});

// Mounted at /api/w/:wId/analytics/users-export.
const app = workspaceApp();

app.get("/", ensureIsAdmin(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const { days, timezone } = ctx.req.valid("query");
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
    return apiError(ctx, {
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

  ctx.header("Content-Type", "text/csv");
  ctx.header(
    "Content-Disposition",
    `attachment; filename="dust_users_last_${days}_days.csv"`
  );
  return ctx.body(csv);
});

export default app;

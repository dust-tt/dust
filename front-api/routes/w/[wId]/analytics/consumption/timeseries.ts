import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import {
  CONSUMPTION_BREAKDOWN_DIMENSIONS,
  DEFAULT_CONSUMPTION_BREAKDOWN_COUNT,
} from "@app/lib/api/analytics/consumption/series";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetConsumptionTimeseriesResponse };

const QuerySchema = ConsumptionQuerySchema.extend({
  granularity: z.enum(["day", "week", "month"]).optional().default("day"),
  mode: z.enum(["daily", "cumulative"]).optional().default("daily"),
  // Absent means a single total series.
  breakdownBy: z.enum(CONSUMPTION_BREAKDOWN_DIMENSIONS).optional(),
  breakdownCount: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .default(DEFAULT_CONSUMPTION_BREAKDOWN_COUNT),
});

// Mounted at /api/w/:wId/analytics/consumption/timeseries.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const {
    granularity,
    mode,
    breakdownBy,
    breakdownCount,
    filter,
    ...periodQuery
  } = ctx.req.valid("query");

  const period = await resolveConsumptionPeriod(
    auth,
    toConsumptionPeriodInput(periodQuery)
  );

  const result = await fetchConsumptionTimeseries(auth, {
    period,
    granularity,
    mode,
    breakdownBy,
    breakdownCount,
    filter,
  });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve consumption timeseries: ${result.error.message}`,
      },
    });
  }

  const body: GetConsumptionTimeseriesResponse = result.value;
  return ctx.json(body);
});

export default app;

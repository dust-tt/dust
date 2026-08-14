import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import {
  CONSUMPTION_METRICS,
  CONSUMPTION_SCOPE_DIMENSIONS,
  DEFAULT_CONSUMPTION_METRIC,
} from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import {
  DEFAULT_CONSUMPTION_BREAKDOWN_COUNT,
  fetchConsumptionTimeseries,
} from "@app/lib/api/analytics/consumption/timeseries";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetConsumptionTimeseriesResponse };

const BodySchema = ConsumptionBodySchema.extend({
  granularity: z.enum(["day", "week", "month"]).optional().default("day"),
  mode: z.enum(["daily", "cumulative"]).optional().default("daily"),
  metric: z
    .enum(CONSUMPTION_METRICS)
    .optional()
    .default(DEFAULT_CONSUMPTION_METRIC),
  // Absent means a single total series. Every dimension the query can be
  // filtered on can also be broken down by.
  breakdownBy: z.enum(CONSUMPTION_SCOPE_DIMENSIONS).optional(),
  breakdownCount: z
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
app.post(
  "/",
  ensureIsManager(),
  validate("json", BodySchema),
  async (ctx): HandlerResult<GetConsumptionTimeseriesResponse> => {
    const auth = ctx.get("auth");
    const {
      granularity,
      mode,
      metric,
      breakdownBy,
      breakdownCount,
      filter,
      ...periodQuery
    } = ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity,
      mode,
      metric,
      breakdownBy,
      breakdownCount,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve timeseries."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve timeseries.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

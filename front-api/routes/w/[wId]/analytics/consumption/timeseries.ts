import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTimeseriesBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  applyConsumptionRequiredFilter,
  consumptionAnalyticsApp,
} from "./context";

export type { GetConsumptionTimeseriesResponse };

// Mounted at /api/w/:wId/analytics/consumption/timeseries.
// Also mounted at /api/w/:wId/me/analytics/consumption/timeseries.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/timeseries.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTimeseriesBodySchema),
  async (ctx): HandlerResult<GetConsumptionTimeseriesResponse> => {
    const auth = ctx.get("auth");
    const excludedDimensions = ctx.get("consumptionExcludedDimensions") ?? [];
    const requiredFilter = ctx.get("consumptionRequiredFilter");
    const {
      granularity,
      mode,
      metric,
      breakdownBy,
      breakdownCount,
      filter,
      ...periodQuery
    } = ctx.req.valid("json");

    if (breakdownBy && excludedDimensions.includes(breakdownBy)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `This consumption analytics scope does not support ${breakdownBy} breakdowns.`,
        },
      });
    }

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
      filter: applyConsumptionRequiredFilter(filter, requiredFilter),
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

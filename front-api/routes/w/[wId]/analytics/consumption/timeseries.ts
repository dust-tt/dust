import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTimeseriesBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionTimeseriesResponse };

// Mounted at /api/w/:wId/analytics/consumption/timeseries.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionTimeseriesBodySchema),
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

import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

export type { GetConsumptionTopModelsResponse };

const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopModelsResponse> => {
    const auth = ctx.get("auth");
    const requiredFilter = ctx.get("consumptionRequiredFilter");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopModels(auth, {
      period,
      limit,
      offset,
      search,
      filter: requiredFilter ? { ...filter, ...requiredFilter } : filter,
      sortOrder,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top-models."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top models.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

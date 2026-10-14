import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopPodsResponse } from "@app/lib/api/analytics/consumption/top_pods";
import { fetchConsumptionTopPods } from "@app/lib/api/analytics/consumption/top_pods";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

// Mounted at /api/w/:wId/analytics/consumption/top-pods.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopPodsResponse> => {
    const auth = ctx.get("auth");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopPods(auth, {
      period,
      limit,
      offset,
      search,
      filter: filter ?? {},
      sortOrder,
    });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve top pods.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;

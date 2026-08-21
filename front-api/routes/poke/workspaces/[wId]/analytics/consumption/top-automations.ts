import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopAutomationsResponse } from "@app/lib/api/analytics/consumption/top_automations";
import { fetchConsumptionTopAutomations } from "@app/lib/api/analytics/consumption/top_automations";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopAutomationsResponse> => {
    const auth = ctx.get("auth");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopAutomations(auth, {
      period,
      limit,
      offset,
      search,
      filter,
      sortOrder,
    });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve top automations.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;

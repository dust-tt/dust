import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/workspaces/:wId/analytics/consumption/overview.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionOverviewResponse> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await fetchConsumptionOverview(auth, {
      periodInput: toConsumptionPeriodInput(body),
      filter: body.filter,
    });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve overview.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;

import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/poke/workspaces/:wId/analytics/consumption/facets.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionFacetsResponse> => {
    const auth = ctx.get("auth");
    const { filter, ...periodInput } = ctx.req.valid("json");
    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodInput)
    );

    const result = await fetchConsumptionFacets(auth, { period, filter });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve consumption facets.",
          },
        },
        result.error
      );
    }

    return ctx.json(result.value);
  }
);

export default app;

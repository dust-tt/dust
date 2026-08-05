import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionTopModelsResponse };

// Mounted at /api/w/:wId/analytics/consumption/top-models.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", ConsumptionTopQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { limit, filter, ...periodQuery } = ctx.req.valid("query");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopModels(auth, {
      period,
      limit,
      filter,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve top models by consumption: ${result.error.message}`,
        },
      });
    }

    const body: GetConsumptionTopModelsResponse = result.value;
    return ctx.json(body);
  }
);

export default app;

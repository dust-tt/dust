import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import {
  ConsumptionQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionOverviewResponse };

// Mounted at /api/w/:wId/analytics/consumption/overview.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", ConsumptionQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const query = ctx.req.valid("query");

    const result = await fetchConsumptionOverview(auth, {
      periodInput: toConsumptionPeriodInput(query),
      filter: query.filter,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve consumption overview: ${result.error.message}`,
        },
      });
    }

    const body: GetConsumptionOverviewResponse = result.value;
    return ctx.json(body);
  }
);

export default app;

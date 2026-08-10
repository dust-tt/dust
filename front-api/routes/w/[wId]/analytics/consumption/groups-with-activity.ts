import type { GetConsumptionGroupsWithActivityResponse } from "@app/lib/api/analytics/consumption/groups_with_activity";
import { fetchConsumptionGroupsWithActivity } from "@app/lib/api/analytics/consumption/groups_with_activity";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionGroupsWithActivityResponse };

// Mounted at /api/w/:wId/analytics/consumption/groups-with-activity.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsManager(),
  validate("query", ConsumptionTopQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { limit, ...periodQuery } = ctx.req.valid("query");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionGroupsWithActivity(auth, {
      period,
      limit,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve consumption groups with activity: ${result.error.message}`,
        },
      });
    }

    const body: GetConsumptionGroupsWithActivityResponse = result.value;
    return ctx.json(body);
  }
);

export default app;

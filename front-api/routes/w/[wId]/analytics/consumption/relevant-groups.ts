import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { GetConsumptionRelevantGroupsResponse } from "@app/lib/api/analytics/consumption/relevant_groups";
import { fetchConsumptionRelevantGroups } from "@app/lib/api/analytics/consumption/relevant_groups";
import {
  ConsumptionTopQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionRelevantGroupsResponse };

// Mounted at /api/w/:wId/analytics/consumption/relevant-groups.
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

    const result = await fetchConsumptionRelevantGroups(auth, {
      period,
      limit,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve consumption-relevant groups: ${result.error.message}`,
        },
      });
    }

    const body: GetConsumptionRelevantGroupsResponse = result.value;
    return ctx.json(body);
  }
);

export default app;

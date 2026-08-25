import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  applyConsumptionRequiredFilter,
  consumptionAnalyticsApp,
} from "./context";

export type { GetConsumptionTopUsersResponse };

// Mounted at /api/w/:wId/analytics/consumption/top-users.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/top-users.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopUsersResponse> => {
    const auth = ctx.get("auth");
    const requiredFilter = ctx.get("consumptionRequiredFilter");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopUsers(auth, {
      period,
      limit,
      offset,
      search,
      filter: applyConsumptionRequiredFilter(filter, requiredFilter),
      sortOrder,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top-users."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top users.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

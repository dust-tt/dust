import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  applyConsumptionRequiredFilter,
  consumptionAnalyticsApp,
} from "./context";

// Mounted at /api/w/:wId/analytics/consumption/overview.
// Also mounted at /api/w/:wId/me/analytics/consumption/overview.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/overview.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionOverviewResponse> => {
    const auth = ctx.get("auth");
    const requiredFilter = ctx.get("consumptionRequiredFilter");
    const body = ctx.req.valid("json");

    const result = await fetchConsumptionOverview(auth, {
      periodInput: toConsumptionPeriodInput(body),
      filter: applyConsumptionRequiredFilter(body.filter, requiredFilter),
      includeWorkspaceContext: requiredFilter === undefined,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve consumption overview."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve overview.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

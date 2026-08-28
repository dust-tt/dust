import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopReasoningEffortsResponse } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import { fetchConsumptionTopReasoningEfforts } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

// Mounted at /api/w/:wId/analytics/consumption/top-reasoning-efforts.
// Also mounted at /api/w/:wId/me/analytics/consumption/top-reasoning-efforts.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/top-reasoning-efforts.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopReasoningEffortsResponse> => {
    const auth = ctx.get("auth");
    const userId = ctx.get("consumptionUserId");
    const agentId = ctx.get("consumptionAgentId");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopReasoningEfforts(auth, {
      period,
      limit,
      offset,
      search,
      filter: {
        ...filter,
        ...(userId ? { users: [userId] } : {}),
        ...(agentId ? { agents: [agentId] } : {}),
      },
      sortOrder,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top-reasoning-efforts."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top reasoning efforts.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopGroupsBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopGroupsResponse } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

export type { GetConsumptionTopGroupsResponse };

// Mounted at /api/w/:wId/analytics/consumption/top-groups.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/top-groups.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopGroupsBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopGroupsResponse> => {
    const auth = ctx.get("auth");
    const userId = ctx.get("consumptionUserId");
    const agentId = ctx.get("consumptionAgentId");
    const { limit, offset, search, filter, sortBy, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopGroups(auth, {
      period,
      limit,
      offset,
      search,
      filter: {
        ...filter,
        ...(userId ? { users: [userId] } : {}),
        ...(agentId ? { agents: [agentId] } : {}),
      },
      ...(sortBy ? { sortBy } : {}),
      sortOrder,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top-groups."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top groups.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

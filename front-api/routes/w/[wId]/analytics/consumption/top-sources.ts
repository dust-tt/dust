import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

export type { GetConsumptionTopSourcesResponse };

// Mounted at /api/w/:wId/analytics/consumption/top-sources.
// Also mounted at /api/w/:wId/me/analytics/consumption/top-sources.
// Also mounted at /api/w/:wId/assistant/agent_configurations/:aId/analytics/consumption/top-sources.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopSourcesResponse> => {
    const auth = ctx.get("auth");
    const userId = ctx.get("consumptionUserId");
    const agentId = ctx.get("consumptionAgentId");
    const { limit, offset, search, filter, sortOrder, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopSources(auth, {
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
        "[ConsumptionAnalytics] Failed to retrieve top-sources."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top sources.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

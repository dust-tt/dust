import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopConversationsResponse } from "@app/lib/api/analytics/consumption/top_conversations";
import { fetchConsumptionTopConversations } from "@app/lib/api/analytics/consumption/top_conversations";
import logger from "@app/logger/logger";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { consumptionAnalyticsApp } from "./context";

const TOP_CONVERSATIONS_LIMIT = 10;

// Mounted at /api/w/:wId/me/analytics/consumption/top-conversations.
const app = consumptionAnalyticsApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopConversationsResponse> => {
    const auth = ctx.get("auth");
    const userId = ctx.get("consumptionUserId");
    if (!userId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message:
            "Top conversations are only available for personal analytics.",
        },
      });
    }
    const { filter, ...periodQuery } = ctx.req.valid("json");
    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopConversations(auth, {
      period,
      limit: TOP_CONVERSATIONS_LIMIT,
      filter: { ...filter, users: [userId] },
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top conversations."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top conversations.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

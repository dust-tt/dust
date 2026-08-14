import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionTopBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopApiKeysResponse } from "@app/lib/api/analytics/consumption/top_api_keys";
import { fetchConsumptionTopApiKeys } from "@app/lib/api/analytics/consumption/top_api_keys";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetConsumptionTopApiKeysResponse };

// Mounted at /api/w/:wId/analytics/consumption/top-api-keys.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionTopBodySchema),
  async (ctx): HandlerResult<GetConsumptionTopApiKeysResponse> => {
    const auth = ctx.get("auth");
    const { limit, offset, filter, ...periodQuery } = ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchConsumptionTopApiKeys(auth, {
      period,
      limit,
      offset,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[ConsumptionAnalytics] Failed to retrieve top-api-keys."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve top API keys.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

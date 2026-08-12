import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import {
  ConsumptionBodySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/analytics/consumption/overview.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", ConsumptionBodySchema),
  async (ctx): HandlerResult<GetConsumptionOverviewResponse> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const result = await fetchConsumptionOverview(auth, {
      periodInput: toConsumptionPeriodInput(body),
      filter: body.filter,
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

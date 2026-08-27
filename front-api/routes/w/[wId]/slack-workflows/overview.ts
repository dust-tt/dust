import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionPeriodSchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetSlackWorkflowsOverviewResponse } from "@app/lib/api/analytics/slack_workflows/overview";
import { fetchSlackWorkflowsOverview } from "@app/lib/api/analytics/slack_workflows/overview";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withCreditPricedPlan } from "@front-api/middlewares/with_credit_priced_plan";

export type { GetSlackWorkflowsOverviewResponse };

// Mounted at /api/w/:wId/slack-workflows/overview.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  withCreditPricedPlan(),
  validate("json", ConsumptionPeriodSchema),
  async (ctx): HandlerResult<GetSlackWorkflowsOverviewResponse> => {
    const auth = ctx.get("auth");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(ctx.req.valid("json"))
    );

    const result = await fetchSlackWorkflowsOverview(auth, { period });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[SlackWorkflowsAnalytics] Failed to retrieve overview."
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

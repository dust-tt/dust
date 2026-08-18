import { AutomationTriggersBodySchema } from "@app/lib/api/analytics/automations/schema";
import type { GetAutomationTriggersResponse } from "@app/lib/api/analytics/automations/triggers";
import { fetchAutomationTriggers } from "@app/lib/api/analytics/automations/triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetAutomationTriggersResponse };

// Mounted at /api/w/:wId/analytics/automations/triggers.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", AutomationTriggersBodySchema),
  async (ctx): HandlerResult<GetAutomationTriggersResponse> => {
    const auth = ctx.get("auth");
    const { limit, offset, search, filter, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchAutomationTriggers(auth, {
      period,
      limit,
      offset,
      search,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[AutomationsAnalytics] Failed to retrieve triggers."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve triggers.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

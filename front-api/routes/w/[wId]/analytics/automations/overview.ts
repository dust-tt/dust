import type { GetAutomationsOverviewResponse } from "@app/lib/api/analytics/automations/overview";
import { fetchAutomationsOverview } from "@app/lib/api/analytics/automations/overview";
import { AutomationsOverviewBodySchema } from "@app/lib/api/analytics/automations/schema";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetAutomationsOverviewResponse };

// Mounted at /api/w/:wId/analytics/automations/overview.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", AutomationsOverviewBodySchema),
  async (ctx): HandlerResult<GetAutomationsOverviewResponse> => {
    const auth = ctx.get("auth");
    const periodQuery = ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchAutomationsOverview(auth, { period });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[AutomationsAnalytics] Failed to retrieve overview."
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

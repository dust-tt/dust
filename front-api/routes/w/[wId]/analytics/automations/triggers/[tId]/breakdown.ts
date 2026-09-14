import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import { fetchAutomationTriggerBreakdown } from "@app/lib/api/analytics/automations/breakdown";
import { AutomationTriggerBreakdownBodySchema } from "@app/lib/api/analytics/automations/schema";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetAutomationTriggerBreakdownResponse };

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/w/:wId/analytics/automations/triggers/:tId/breakdown.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("param", ParamsSchema),
  validate("json", AutomationTriggerBreakdownBodySchema),
  async (ctx): HandlerResult<GetAutomationTriggerBreakdownResponse> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");
    const periodQuery = ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: tId,
      period,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          triggerId: tId,
          err: result.error,
        },
        "[AutomationsAnalytics] Failed to retrieve trigger breakdown."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve trigger breakdown.",
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;

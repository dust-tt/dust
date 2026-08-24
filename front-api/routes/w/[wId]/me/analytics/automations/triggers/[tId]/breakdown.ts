import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import { fetchAutomationTriggerBreakdown } from "@app/lib/api/analytics/automations/breakdown";
import { AutomationTriggerBreakdownBodySchema } from "@app/lib/api/analytics/automations/schema";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetAutomationTriggerBreakdownResponse };

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/w/:wId/me/analytics/automations/triggers/:tId/breakdown.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", AutomationTriggerBreakdownBodySchema),
  async (ctx): HandlerResult<GetAutomationTriggerBreakdownResponse> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");
    const periodQuery = ctx.req.valid("json");

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger || !trigger.isEditedBy(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: "Trigger not found.",
        },
      });
    }

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery),
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
        "[AutomationsAnalytics] Failed to retrieve user trigger breakdown.",
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
  },
);

export default app;

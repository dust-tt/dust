import { fetchAutomationTriggerConsumptionStats } from "@app/lib/api/analytics/automations/triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionPeriodSchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { CARDINALITY_PRECISION_THRESHOLD } from "@app/lib/api/analytics/consumption/scope";
import type { PokeGetTriggerConsumptionResponse } from "@app/lib/api/poke/triggers";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const TriggerConsumptionBodySchema = ConsumptionPeriodSchema.extend({
  triggerIds: z
    .array(z.string().min(1))
    .min(1)
    .max(CARDINALITY_PRECISION_THRESHOLD),
});

// Mounted at /api/poke/workspaces/:wId/triggers/consumption.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", TriggerConsumptionBodySchema),
  async (ctx): HandlerResult<PokeGetTriggerConsumptionResponse> => {
    const auth = ctx.get("auth");
    const { triggerIds, ...periodQuery } = ctx.req.valid("json");
    const uniqueTriggerIds = [...new Set(triggerIds)];

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );
    const result = await fetchAutomationTriggerConsumptionStats(auth, {
      period,
      triggerIds: uniqueTriggerIds,
    });
    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to retrieve trigger consumption.",
          },
        },
        result.error
      );
    }

    const statsByTriggerId = new Map(
      result.value.map((stat) => [stat.triggerId, stat])
    );

    return ctx.json({
      period,
      stats: uniqueTriggerIds.map((triggerId) => {
        const stat = statsByTriggerId.get(triggerId);
        const estimatedRunCount = stat?.runCount ?? 0;
        const credits = stat?.credits ?? 0;

        return {
          triggerId,
          credits,
          estimatedRunCount,
          estimatedCreditsPerRun:
            estimatedRunCount > 0 ? credits / estimatedRunCount : null,
        };
      }),
    });
  }
);

export default app;

import {
  GENERIC_ERROR_MESSAGE,
  generateScheduleRule,
  INVALID_TIMEZONE_MESSAGE,
  TOO_FREQUENT_MESSAGE,
} from "@app/lib/api/assistant/configuration/triggers";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type PostTextAsCronRuleResponseBody =
  | { type?: "cron"; cronRule: string; timezone: string }
  | {
      type: "interval";
      intervalDays: number;
      dayOfWeek: number | null;
      hour: number;
      minute: number;
      timezone: string;
    };

function scheduleConfigToResponse(
  config: ScheduleConfig
): PostTextAsCronRuleResponseBody {
  if (config.type === "interval") {
    return {
      type: "interval",
      intervalDays: config.intervalDays,
      dayOfWeek: config.dayOfWeek,
      hour: config.hour,
      minute: config.minute,
      timezone: config.timezone,
    };
  }
  return {
    type: "cron",
    cronRule: "cron" in config ? config.cron : "",
    timezone: config.timezone,
  };
}

const PostTextAsCronRuleRequestBodySchema = z.object({
  naturalDescription: z.string(),
  defaultTimezone: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/text_as_cron_rule.
const app = new Hono();

app.post(
  "/",
  validate("json", PostTextAsCronRuleRequestBodySchema),
  async (ctx): HandlerResult<PostTextAsCronRuleResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");

    const r = await generateScheduleRule(auth, body);

    if (r.isErr()) {
      const cleanMessage = [
        INVALID_TIMEZONE_MESSAGE,
        TOO_FREQUENT_MESSAGE,
      ].includes(r.error.message)
        ? r.error.message
        : GENERIC_ERROR_MESSAGE;
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: cleanMessage,
        },
      });
    }

    return ctx.json(scheduleConfigToResponse(r.value));
  }
);

export default app;

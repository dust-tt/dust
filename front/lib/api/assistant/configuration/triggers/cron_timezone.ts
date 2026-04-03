import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { GPT_4_1_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ScheduleConfig } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const SET_SCHEDULE_FUNCTION_NAME = "set_schedule";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SCHEDULE_FUNCTION_NAME,
    description:
      "Setup a schedule and timezone for triggering an assistant. Use type 'cron' for standard schedules, 'interval' for multi-day/multi-week intervals.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["cron", "interval"],
          description:
            "Schedule type: 'cron' for standard schedules, 'interval' for multi-day or multi-week intervals not expressible in cron.",
        },
        cron: {
          type: "string",
          description:
            "The schedule expressed in cron format. Required when type is 'cron'.",
        },
        timezone: {
          type: "string",
          description: "The timezone expressed in IANA Timezone format.",
        },
        intervalDays: {
          type: "number",
          description:
            "Number of days between each occurrence. Required when type is 'interval'. E.g. 14 for bi-weekly, 3 for every 3 days.",
        },
        dayOfWeek: {
          type: ["number", "null"],
          description:
            "Day of week (0=Sunday, 6=Saturday) for week-aligned intervals. Null for pure day intervals. Used when type is 'interval'.",
        },
        hour: {
          type: "number",
          description:
            "Hour of day (0-23) for interval schedules. Used when type is 'interval'.",
        },
        minute: {
          type: "number",
          description:
            "Minute of hour (0-59) for interval schedules. Used when type is 'interval'.",
        },
      },
      required: ["type", "timezone"],
    },
  },
];

export async function getCronTimezoneGeneration(
  auth: Authenticator,
  inputs: { naturalDescription: string; defaultTimezone: string }
): Promise<Result<ScheduleConfig, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = GPT_4_1_MINI_MODEL_CONFIG;
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: JSON.stringify(inputs) }],
            name: "",
          },
        ],
      },
      prompt: `The user is adding a schedule to trigger an assistant. Convert their natural language description to a schedule configuration.

You MUST choose the right schedule type:

<type_cron>
Use type: "cron" for standard schedules that CAN be expressed in 5-field cron format:
- Every day, every hour, every weekday, every Monday, every 1st of month, every quarter, every N months

5-field cron: minute hour day-of-month month day-of-week
- minute: 0-59
- hour: 0-23
- day-of-month: 1-31
- month: 1-12
- day-of-week: 0-6 (0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday)

Operators:
- * : any value
- , : list (e.g., 1,15 or 1-7,15-21)
- - : range (e.g., 1-5 for Monday to Friday)
- / : step (e.g., */15 for every 15 minutes)

IMPORTANT: The # and L operators are NOT supported. Do NOT use them.
</type_cron>

<type_interval>
Use type: "interval" ONLY for multi-day or multi-week intervals that cron CANNOT express:
- "every other week", "bi-weekly", "every 2 weeks", "every 3 days", "every 10 days"

For interval type, provide: intervalDays, dayOfWeek (or null for pure day intervals), hour, minute.
</type_interval>

<examples>
type: "cron" examples:
- "Every Monday at 9am" → type: "cron", cron: "0 9 * * 1", timezone: defaultTimezone
- "Every weekday at 8:30am" → type: "cron", cron: "30 8 * * 1-5", timezone: defaultTimezone
- "Every day at midnight" → type: "cron", cron: "0 0 * * *", timezone: defaultTimezone
- "Every hour" → type: "cron", cron: "0 * * * *", timezone: defaultTimezone
- "Every 15th of the month at noon" → type: "cron", cron: "0 12 15 * *", timezone: defaultTimezone
- "Every quarter" → type: "cron", cron: "0 0 1 */3 *", timezone: defaultTimezone
- "Every Monday at 9am in New York" → type: "cron", cron: "0 9 * * 1", timezone: "America/New_York"
- "Daily at 8am Paris time" → type: "cron", cron: "0 8 * * *", timezone: "Europe/Paris"

type: "interval" examples:
- "Every other Monday at 9am" → type: "interval", intervalDays: 14, dayOfWeek: 1, hour: 9, minute: 0, timezone: defaultTimezone
- "Bi-weekly on Friday at 3pm" → type: "interval", intervalDays: 14, dayOfWeek: 5, hour: 15, minute: 0, timezone: defaultTimezone
- "Every 3 days at noon" → type: "interval", intervalDays: 3, dayOfWeek: null, hour: 12, minute: 0, timezone: defaultTimezone
- "Every 10 days at 8am" → type: "interval", intervalDays: 10, dayOfWeek: null, hour: 8, minute: 0, timezone: defaultTimezone
- "Every 2 weeks on Wednesday at 10am" → type: "interval", intervalDays: 14, dayOfWeek: 3, hour: 10, minute: 0, timezone: defaultTimezone
</examples>

<instructions>
1. Parse the natural language description
2. If no time is specified, default to 9:00 AM
3. Use defaultTimezone unless a specific timezone is mentioned in the description
4. ALWAYS use IANA timezone format (e.g., Europe/Paris, America/New_York), never UTC offsets
5. ALWAYS prefer type "cron" — it covers the vast majority of schedules. Use type "interval" ONLY when the schedule genuinely cannot be expressed as a 5-field cron (e.g. "every 2 weeks", "every 3 days"). When in doubt, use "cron".
6. Call set_schedule with the appropriate fields based on the type
</instructions>`,
      specifications,
      forceToolCall: SET_SCHEDULE_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "trigger_cron_timezone_generator",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const action = res.value.actions?.find(
    (a) => a.name === SET_SCHEDULE_FUNCTION_NAME
  );

  if (!action) {
    return new Err(new Error("No schedule action generated"));
  }

  const { type, timezone, cron, intervalDays, dayOfWeek, hour, minute } =
    action.arguments;

  if (!timezone) {
    return new Err(new Error("No timezone generated"));
  }

  if (type === "interval") {
    if (typeof intervalDays !== "number" || intervalDays <= 0) {
      return new Err(new Error("Invalid intervalDays for interval schedule"));
    }
    if (typeof hour !== "number" || typeof minute !== "number") {
      return new Err(new Error("Missing hour/minute for interval schedule"));
    }
    return new Ok({
      type: "interval",
      intervalDays,
      dayOfWeek: typeof dayOfWeek === "number" ? dayOfWeek : null,
      hour,
      minute,
      timezone,
    });
  }

  // Default to cron type
  if (!cron) {
    return new Err(new Error("No cron rule generated"));
  }

  return new Ok({ type: "cron", cron, timezone });
}

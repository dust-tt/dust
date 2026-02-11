import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { GPT_4_1_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const SET_SCHEDULE_FUNCTION_NAME = "set_schedule";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SCHEDULE_FUNCTION_NAME,
    description:
      "Setup a schedule and timezone for triggering an assistant. Both cron and timezone are required.",
    inputSchema: {
      type: "object",
      properties: {
        cron: {
          type: "string",
          description: "The schedule expressed in cron format.",
        },
        timezone: {
          type: "string",
          description: "The timezone expressed in IANA Timezone format.",
        },
      },
      required: ["cron", "timezone"],
    },
  },
];

export async function getCronTimezoneGeneration(
  auth: Authenticator,
  inputs: { naturalDescription: string; defaultTimezone: string }
): Promise<Result<{ cron: string; timezone: string }, Error>> {
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
      prompt: `The user is adding a schedule to trigger an assistant. Convert their natural language description to cron format.

<cron_format>
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
</cron_format>

<examples>
- "Every Monday at 9am" → cron: "0 9 * * 1", timezone: defaultTimezone
- "Every weekday at 8:30am" → cron: "30 8 * * 1-5", timezone: defaultTimezone
- "Every day at midnight" → cron: "0 0 * * *", timezone: defaultTimezone
- "Every hour" → cron: "0 * * * *", timezone: defaultTimezone
- "Every 15th of the month at noon" → cron: "0 12 15 * *", timezone: defaultTimezone
- "Every quarter" → cron: "0 0 1 */3 *", timezone: defaultTimezone
- "Every Monday at 9am in New York" → cron: "0 9 * * 1", timezone: "America/New_York"
- "Daily at 8am Paris time" → cron: "0 8 * * *", timezone: "Europe/Paris"
</examples>

<instructions>
1. Parse the natural language description
2. If no time is specified, default to 9:00 AM
3. Use defaultTimezone unless a specific timezone is mentioned in the description
4. ALWAYS use IANA timezone format (e.g., Europe/Paris, America/New_York), never UTC offsets
5. Call set_schedule with both the cron expression and timezone
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

  const { cron, timezone } = action.arguments;

  if (!cron) {
    return new Err(new Error("No cron rule generated"));
  }

  if (!timezone) {
    return new Err(new Error("No timezone generated"));
  }

  return new Ok({ cron, timezone });
}

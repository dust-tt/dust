import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, Ok } from "@app/types";

const SET_SCHEDULE_FUNCTION_NAME = "set_schedule";
const SET_TIMEZONE_FUNCTION_NAME = "set_tz";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SCHEDULE_FUNCTION_NAME,
    description: "Setup a schedule for triggering an assistant",
    inputSchema: {
      type: "object",
      properties: {
        cron: {
          type: "string",
          description: "The schedule expressed in cron format.",
        },
      },
      required: ["cron"],
    },
  },
  {
    name: SET_TIMEZONE_FUNCTION_NAME,
    description: "Setup a timezone for triggering an assistant",
    inputSchema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "The timezone expressed in IANA Timezone format.",
        },
      },
      required: ["timezone"],
    },
  },
];

export async function getCronTimezoneGeneration(
  auth: Authenticator,
  inputs: { naturalDescription: string; defaultTimezone: string }
): Promise<Result<{ cron: string; timezone: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
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
- "Every Monday at 9am" → 0 9 * * 1
- "Every weekday at 8:30am" → 30 8 * * 1-5
- "Every day at midnight" → 0 0 * * *
- "Every hour" → 0 * * * *
- "Every 15th of the month at noon" → 0 12 15 * *
- "Every quarter" → 0 0 1 */3 *
</examples>

<instructions>
1. Parse the natural language description
2. If no time is specified, default to 9:00 AM
3. Call set_schedule with the cron expression
4. Call set_tz with the timezone (use defaultTimezone if not specified in description)
5. ALWAYS use IANA timezone format (e.g., Europe/Paris, America/New_York), never UTC offsets
6. ALWAYS call both tools
</instructions>`,
      specifications,
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

  let cron: string | null = null;
  let timezone: string | null = null;

  if (res.value.actions) {
    for (const action of res.value.actions) {
      if (action.name === SET_SCHEDULE_FUNCTION_NAME) {
        cron = action.arguments.cron;
      }
      if (action.name === SET_TIMEZONE_FUNCTION_NAME) {
        timezone = action.arguments.timezone;
      }
    }
  }

  if (!cron) {
    return new Err(new Error("No cron rule generated"));
  }

  if (!timezone) {
    return new Err(new Error("No timezone generated"));
  }

  return new Ok({ cron, timezone });
}

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
      prompt:
        "The user is currently adding a schedule to trigger an assistant based on a large language model. The user is describing the schedule in natural language.\n\n" +
        "For the cron generation (set_schedule):\n" +
        "You must interpret the description, convert it to the cron format and call set_schedule with the cron rule as an argument.\n\n" +
        "For the timezone generation (set_tz):\n" +
        "You must interpret the description, get the requested timezone from the user, and call set_tz with the timezone as an argument.\n" +
        "If no timezone is specified in the naturalDescription, return the defaultTimezone.\n" +
        "ALWAYS use IANA Timezone such as Europe/Paris, or America/New_York.\n" +
        "ALWAYS call both tools",
      specifications,
    },
    {
      context: {
        operationType: "trigger_cron_timezone_generator",
        userId: auth.user()?.sId,
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

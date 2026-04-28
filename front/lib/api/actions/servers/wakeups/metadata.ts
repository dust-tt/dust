import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const WAKEUPS_SERVER_NAME = "wakeups" as const;

export const WAKEUPS_TOOLS_METADATA = createToolsRecord({
  schedule_wakeup: {
    description:
      "Schedule a wake-up that posts a user message at a future time to re-invoke " +
      "the agent. Use this to check back on something later, remind the user, poll until a " +
      "condition is met or schedule recurring work. The `when` field accepts three formats: " +
      '(1) relative duration like "in 2h", "in 30m", "in 1d";\n' +
      '(2) absolute ISO 8601 timestamp like "2026-04-16T16:00:00Z";\n' +
      '(3) 5-field cron expression like "0 9 * * MON-FRI". (# and L are not supported).\n' +
      "Cron expressions fire recurrently until a fire cap is reached. Only one active wake-up " +
      "is allowed at a time.",
    schema: {
      when: z
        .string()
        .describe(
          'When to wake up. One of: relative duration ("in 2h", "in 30m", "in 1d"), ' +
            'ISO 8601 timestamp ("2026-04-16T16:00:00Z"), or 5-field cron expression ("0 9 * * MON-FRI").'
        ),
      reason: z
        .string()
        .min(1)
        .describe(
          "Short, user-facing explanation of why the wake-up is being scheduled. " +
            "Displayed in the UI and included in the wake-up message so the agent has context when it resumes."
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone (e.g. 'Europe/Paris'). Required only when `when` is a cron expression. " +
            "If omitted, falls back to the user's timezone."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Scheduling wake-up",
      done: "Schedule wake-up",
    },
  },
  list_wakeups: {
    description:
      "List wake-ups with their status, schedule, and reason. " +
      "Useful for checking what's already scheduled before creating a new wake-up, or for " +
      "finding the wake-up ID needed to cancel a wake-up.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing wake-ups",
      done: "List wake-ups",
    },
  },
  cancel_wakeup: {
    description:
      "Cancel a previously scheduled wake-up by ID. " +
      "Cancelling an already-fired, cancelled, or expired wake-up is a no-op.",
    schema: {
      wakeUpId: z
        .string()
        .describe(
          "The ID of the wake-up to cancel, as returned by `schedule_wakeup` or `list_wakeups`."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Cancelling wake-up",
      done: "Cancel wake-up",
    },
  },
});

export const WAKEUPS_SERVER = {
  serverInfo: {
    name: WAKEUPS_SERVER_NAME,
    version: "1.0.0",
    description: "Schedule wake-ups that re-invoke the agent at a later time.",
    authorization: null,
    icon: "ActionTimeIcon",
    documentationUrl: null,
    instructions: null,
    displayedAs: "agent",
  },
  tools: Object.values(WAKEUPS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(WAKEUPS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

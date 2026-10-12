import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const WAKEUPS_SERVER_NAME = "wakeups" as const;

export const WAKEUPS_TOOLS_METADATA = [
  {
    name: "schedule_wakeup",
    description:
      "Schedule a conversation-scoped wake-up that posts a user message in the current conversation " +
      "at a future time to re-invoke the agent. Use it to continue this conversation later: check back " +
      "on something, remind the user, or poll until a condition is met. For durable recurring automation " +
      "independent of the current conversation, create a trigger schedule instead. The `when` field accepts three formats: " +
      '(1) relative duration like "in 2h", "in 30m", "in 1d";\n' +
      '(2) absolute ISO 8601 timestamp like "2026-04-16T16:00:00Z";\n' +
      '(3) 5-field cron expression like "0 9 * * MON-FRI". (# and L are not supported).\n' +
      "Cron expressions fire recurrently up to 32 times. Only one active wake-up is allowed per conversation.",
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
    // This static default remains high to avoid cascading usage on legacy plans. At runtime,
    // credit-priced subscriptions resolve this tool to low stake because usage is credit-limited.
    stake: "high",
    displayLabels: {
      running: "Scheduling wake-up",
      done: "Schedule wake-up",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "list_wakeups",
    description:
      "List wake-ups and reminders with their status, schedule, and reason, including " +
      "pending reminders and already-fired, cancelled, or expired wake-ups. Useful for checking " +
      "what's already scheduled before creating a new wake-up, or for finding the wake-up ID " +
      "needed to cancel a wake-up.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing wake-ups",
      done: "List wake-ups",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "cancel_wakeup",
    description:
      "Cancel or stop a previously scheduled wake-up or reminder by ID. " +
      "Useful for requests to stop a reminder set earlier, remove a scheduled follow-up, or cancel " +
      "a wake-up. Cancelling an already-fired, cancelled, or expired wake-up " +
      "is a no-op.",
    schema: {
      wakeUpId: z
        .string()
        .describe(
          "The ID of the wake-up to cancel, as returned by `schedule_wakeup` or `list_wakeups`."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Cancelling wake-up",
      done: "Cancel wake-up",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const WAKEUPS_SERVER = {
  serverInfo: {
    name: WAKEUPS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Resume the current conversation later for reminders, follow-ups, and polling.",
    authorization: null,
    icon: "ActionTimeIcon",
    documentationUrl: null,
    displayedAs: "agent",
  },
  tools: WAKEUPS_TOOLS_METADATA,
} as const satisfies ServerMetadata;

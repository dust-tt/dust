import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SCHEDULES_MANAGEMENT_TOOL_NAME = "schedules_management" as const;

export const SCHEDULES_MANAGEMENT_TOOLS_METADATA = createToolsRecord({
  create_schedule: {
    description: "Create a schedule that runs this agent at specified times.",
    schema: {
      name: z
        .string()
        .max(255)
        .describe(
          "A short, descriptive name for the schedule (max 255 chars). Examples: 'Daily email summary', 'Weekly PR review', 'Morning standup prep'. Schedule name MUST be unique."
        ),
      schedule: z
        .string()
        .describe(
          "When to run, in natural language. Examples: 'every weekday at 9am', 'every Monday morning', 'daily at 8am', 'first day of each month at noon', 'every Friday at 5pm'"
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "What the agent should do when the schedule runs. Examples: 'Summarize my emails from yesterday', 'Show PRs that need my review', 'Generate a weekly status report'"
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone for the schedule. Examples: 'Europe/Paris', 'America/New_York', 'Asia/Tokyo'. If not provided, uses user's timezone from context."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Creating schedule",
      done: "Create schedule",
    },
  },
  list_schedules: {
    description: "List all schedules created for this agent.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing schedules",
      done: "List schedules",
    },
  },
  disable_schedule: {
    description: "Disable a schedule.",
    schema: {
      scheduleId: z
        .string()
        .describe("The schedule ID (get this from list_schedules)"),
    },
    stake: "high",
    displayLabels: {
      running: "Disabling schedule",
      done: "Disable schedule",
    },
  },
});

type SchedulesManagementToolKey =
  keyof typeof SCHEDULES_MANAGEMENT_TOOLS_METADATA;

export const SCHEDULES_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "schedules_management" as const,
    version: "1.0.0",
    description: "Create schedules to automate recurring tasks.",
    authorization: null,
    icon: "ActionTimeIcon" as const,
    documentationUrl: null,
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions:
      "Schedules are user-specific: each user can only view and manage their own schedules. " +
      "When a schedule triggers, it runs this agent with the specified prompt. " +
      "Limit: 20 schedule creations per user per day.",
  },
  tools: (
    Object.keys(
      SCHEDULES_MANAGEMENT_TOOLS_METADATA
    ) as SchedulesManagementToolKey[]
  ).map((key) => ({
    name: SCHEDULES_MANAGEMENT_TOOLS_METADATA[key].name,
    description: SCHEDULES_MANAGEMENT_TOOLS_METADATA[key].description,
    inputSchema: zodToJsonSchema(
      z.object(SCHEDULES_MANAGEMENT_TOOLS_METADATA[key].schema)
    ) as JSONSchema,
    displayLabels: SCHEDULES_MANAGEMENT_TOOLS_METADATA[key].displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    (
      Object.keys(
        SCHEDULES_MANAGEMENT_TOOLS_METADATA
      ) as SchedulesManagementToolKey[]
    ).map((key) => [key, SCHEDULES_MANAGEMENT_TOOLS_METADATA[key].stake])
  ),
} as const satisfies ServerMetadata;

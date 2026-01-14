import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const createScheduleSchema = {
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
};

export const listSchedulesSchema = {};

export const disableScheduleSchema = {
  scheduleId: z
    .string()
    .describe("The schedule ID (get this from list_schedules)"),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const SCHEDULES_MANAGEMENT_TOOLS: MCPToolType[] = [
  {
    name: "create_schedule",
    description: "Create a schedule that runs this agent at specified times.",
    inputSchema: zodToJsonSchema(z.object(createScheduleSchema)) as JSONSchema,
  },
  {
    name: "list_schedules",
    description: "List all schedules created for this agent.",
    inputSchema: zodToJsonSchema(z.object(listSchedulesSchema)) as JSONSchema,
  },
  {
    name: "disable_schedule",
    description: "Disable a schedule.",
    inputSchema: zodToJsonSchema(z.object(disableScheduleSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SCHEDULES_MANAGEMENT_SERVER_INFO = {
  name: "schedules_management" as const,
  version: "1.0.0",
  description: "Create schedules to automate recurring tasks.",
  icon: "ActionTimeIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions:
    "Schedules are user-specific: each user can only view and manage their own schedules. " +
    "When a schedule triggers, it runs this agent with the specified prompt. " +
    "Limit: 20 schedule creations per user per day.",
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const SCHEDULES_MANAGEMENT_TOOL_STAKES = {
  create_schedule: "high",
  list_schedules: "never_ask",
  disable_schedule: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;

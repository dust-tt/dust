import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const TRIGGERS_MANAGEMENT_TOOLS_METADATA = [
  {
    name: "create_schedule",
    description:
      "Create a schedule that runs this agent at specified times. Schedules are user-specific: each user can only view and manage their own schedules. When the schedule triggers, it runs this agent with the specified prompt. Pass podId to attach the schedule to a Pod so its runs land there. Limit: 20 schedule creations per user per day.",
    schema: {
      name: z
        .string()
        .max(255)
        .describe(
          "A short, descriptive name for the schedule (max 255 chars). Examples: 'Daily email summary', 'Weekly PR review', 'Morning standup prep'. Schedule name MUST be unique."
        ),
      podId: z
        .string()
        .optional()
        .describe(
          "Optional Pod ID (sId) to attach this schedule to, so its runs land in that Pod. Omit for a schedule not tied to a Pod."
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: "list_triggers",
    description:
      "List all triggers (schedules and event triggers) created for this agent by the current user. Pass podId to filter triggers associated with a specific Pod.",
    schema: {
      podId: z
        .string()
        .optional()
        .describe(
          "Optional Pod ID (sId) to filter triggers associated with this Pod. Omit to list all triggers."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing triggers",
      done: "List triggers",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "disable_trigger",
    description: "Disable a trigger (a schedule or an event trigger).",
    schema: {
      triggerId: z
        .string()
        .describe("The trigger ID (get this from list_triggers)"),
    },
    stake: "high",
    displayLabels: {
      running: "Disabling trigger",
      done: "Disable trigger",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "list_event_sources",
    description:
      "List the webhook sources configured in the workspace that can be used for event triggers, along with the events each source emits. Call this before create_event_trigger to discover valid sourceId and event values.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing event sources",
      done: "List event sources",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "create_event_trigger",
    description:
      "Create a trigger that runs this agent when an external event arrives from a configured webhook source (e.g. GitHub, Linear, Jira, Zendesk). Unlike schedules, these fire on events rather than at fixed times. Webhook sources cannot be created by the agent — they must already be configured in the workspace. Call list_event_sources first to discover valid sourceId and event values. Pass podId to attach the trigger to a Pod so its runs land there.",
    schema: {
      name: z
        .string()
        .max(255)
        .describe(
          "A short, descriptive name for the trigger (max 255 chars). Examples: 'On new GitHub PR', 'On Linear issue created'. Name MUST be unique for this agent."
        ),
      sourceId: z
        .string()
        .optional()
        .describe(
          "The ID (sId) of the webhook source to listen to, from list_event_sources. If omitted or unknown, the tool returns the available sources instead of creating."
        ),
      event: z
        .string()
        .optional()
        .describe(
          "The event to listen for on the chosen source (e.g. 'pull_request', 'issues'), from list_event_sources. If omitted or invalid, the tool returns the source's available events."
        ),
      filterDescription: z
        .string()
        .optional()
        .describe(
          "Optional natural-language description of which events should trigger the agent, used to generate a payload filter. Examples: 'only PRs opened against main', 'issues labeled bug'. Omit to trigger on every event of this type."
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          "What the agent should do when the event fires. Examples: 'Summarize the pull request and post it to Slack', 'Triage the new issue'."
        ),
      includePayload: z
        .boolean()
        .optional()
        .describe(
          "Whether to pass the event payload to the agent when it runs. Defaults to true."
        ),
      podId: z
        .string()
        .optional()
        .describe(
          "Optional Pod ID (sId) to attach this trigger to, so its runs land in that Pod. Omit for a trigger not tied to a Pod."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Creating event trigger",
      done: "Create event trigger",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
] as const;

export const TRIGGERS_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "triggers_management" as const,
    version: "1.0.0",
    description:
      "Create schedules and event triggers to automate recurring and event-driven tasks.",
    authorization: null,
    icon: "ActionTimeIcon" as const,
    documentationUrl: null,
  },
  tools: TRIGGERS_MANAGEMENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;

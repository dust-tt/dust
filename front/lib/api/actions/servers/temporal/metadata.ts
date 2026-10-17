import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const COUNT_WORKFLOWS_TOOL_NAME = "count_workflows";
export const LIST_WORKFLOWS_TOOL_NAME = "list_workflows";
export const DESCRIBE_WORKFLOW_TOOL_NAME = "describe_workflow";
export const GET_WORKFLOW_HISTORY_TOOL_NAME = "get_workflow_history";
export const DESCRIBE_TASK_QUEUE_TOOL_NAME = "describe_task_queue";

export const TEMPORAL_NAMESPACES = ["agent", "front", "connectors"] as const;
export type TemporalNamespace = (typeof TEMPORAL_NAMESPACES)[number];

export const LIST_WORKFLOWS_DEFAULT_LIMIT = 50;
export const LIST_WORKFLOWS_MAX_LIMIT = 200;
export const HISTORY_DEFAULT_MAX_EVENTS = 200;
export const HISTORY_MAX_EVENTS = 1000;

const namespaceSchema = {
  namespace: z
    .enum(TEMPORAL_NAMESPACES)
    .describe(
      "Temporal namespace: `agent` (agent loop workflows), `front` (front background " +
        "workflows: upserts, indexation, analytics, credits, triggers...), or `connectors` " +
        "(connector sync workflows)."
    ),
};

const visibilityQuerySchema = z
  .string()
  .optional()
  .describe(
    "Temporal visibility list filter, e.g. " +
      '`WorkflowType = "agentLoopWorkflow" AND ExecutionStatus = "Failed" AND ' +
      'CloseTime > "2026-10-17T10:00:00Z"`. Supported attributes include WorkflowId ' +
      "(with STARTS_WITH), WorkflowType, ExecutionStatus (Running, Completed, Failed, " +
      "Canceled, Terminated, ContinuedAsNew, TimedOut), TaskQueue, StartTime, CloseTime, " +
      "ExecutionDuration. Omit to match all workflows."
  );

const workflowExecutionSchema = {
  ...namespaceSchema,
  workflow_id: z.string().describe("The Temporal workflow ID."),
  run_id: z
    .string()
    .optional()
    .describe("The run ID. Defaults to the latest run of the workflow."),
};

export const TEMPORAL_TOOLS_METADATA = [
  {
    name: COUNT_WORKFLOWS_TOOL_NAME,
    description:
      "Count Temporal workflow executions matching a visibility query, optionally grouped by " +
      "execution status. Use it to size an incident (e.g. how many workflows of a type failed " +
      "or are still running in a time window).",
    schema: {
      ...namespaceSchema,
      query: visibilityQuerySchema,
      group_by_status: z
        .boolean()
        .optional()
        .describe(
          "Group the count by ExecutionStatus. Defaults to false. The query must not " +
            "already contain a GROUP BY clause."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Counting Temporal workflows",
      done: "Counted Temporal workflows",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: LIST_WORKFLOWS_TOOL_NAME,
    description:
      "List Temporal workflow executions matching a visibility query, most recent first, " +
      "with their type, status, task queue, start/close times, duration, and history length.",
    schema: {
      ...namespaceSchema,
      query: visibilityQuerySchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(LIST_WORKFLOWS_MAX_LIMIT)
        .optional()
        .describe(
          `Max executions to return (default: ${LIST_WORKFLOWS_DEFAULT_LIMIT}, max: ${LIST_WORKFLOWS_MAX_LIMIT}).`
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Temporal workflows",
      done: "Listed Temporal workflows",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DESCRIBE_WORKFLOW_TOOL_NAME,
    description:
      "Get the current state of a Temporal workflow execution: status, timings, parent, " +
      "pending activities (attempt, last failure, last heartbeat, worker identity), pending " +
      "child workflows, and the pending workflow task. Use it to see why a running workflow " +
      "is stuck or retrying.",
    schema: workflowExecutionSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Describing Temporal workflow",
      done: "Described Temporal workflow",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: GET_WORKFLOW_HISTORY_TOOL_NAME,
    description:
      "Get the event history of a Temporal workflow execution as a compact timeline (activities, " +
      "timers, signals, child workflows, workflow task failures, terminal events) plus per " +
      "activity type timing stats (schedule-to-start and start-to-close durations, failures, " +
      "timeouts, attempts). Intermediate activity retry attempts are not recorded in history: " +
      "use `describe_workflow` for the last failure of a retrying activity.",
    schema: {
      ...workflowExecutionSchema,
      order: z
        .enum(["latest", "earliest"])
        .optional()
        .describe(
          "Which end of the history to read when it exceeds `max_events`. Defaults to " +
            "`latest` (most recent events, usually what matters during an incident)."
        ),
      max_events: z
        .number()
        .int()
        .min(1)
        .max(HISTORY_MAX_EVENTS)
        .optional()
        .describe(
          `Max history events to read (default: ${HISTORY_DEFAULT_MAX_EVENTS}, max: ${HISTORY_MAX_EVENTS}).`
        ),
      include_payloads: z
        .boolean()
        .optional()
        .describe(
          "Include truncated workflow input and activity inputs/results in the timeline. " +
            "Defaults to false."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching Temporal workflow history",
      done: "Fetched Temporal workflow history",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DESCRIBE_TASK_QUEUE_TOOL_NAME,
    description:
      "Get the pollers (worker identities and last poll time) and backlog stats (approximate " +
      "backlog count and age, add and dispatch rates) of a Temporal task queue, for both " +
      "workflow and activity tasks. Use it to check whether workers are alive and keeping up. " +
      "Task queue names appear in `list_workflows` results.",
    schema: {
      ...namespaceSchema,
      task_queue: z.string().describe("The task queue name."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing Temporal task queue",
      done: "Described Temporal task queue",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const TEMPORAL_SERVER = {
  serverInfo: {
    name: "temporal",
    version: "1.0.0",
    description:
      "Dust-internal read-only tools to inspect Dust's own Temporal workflows, activities, and " +
      "task queues while debugging incidents. Requires super user privileges.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
  },
  tools: TEMPORAL_TOOLS_METADATA,
} as const satisfies ServerMetadata;

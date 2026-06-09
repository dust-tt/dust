import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  PodTasksCreateTasksInputSchema,
  PodTasksUpdateTasksInputSchema,
} from "@app/lib/api/actions/servers/pod_tasks/types";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POD_TASKS_SERVER_NAME = "pod_tasks" as const;
export const CREATE_TASKS_TOOL_NAME = "create_tasks" as const;
export const UPDATE_TASKS_TOOL_NAME = "update_tasks" as const;
export const START_TASK_AGENT_TOOL_NAME = "start_task_agent" as const;

export const POD_TASKS_TOOLS_METADATA = createToolsRecord({
  list_tasks: {
    description:
      "List tasks in the Pod. " +
      "Defaults to the current user's tasks (assigneeFilter='mine') and open (statusFilter='open') items. ",
    schema: {
      assigneeFilter: z
        .enum(["mine", "all"])
        .default("mine")
        .optional()
        .describe(
          "Which tasks to return. 'mine' = only the current user's tasks (default); 'all' = all tasks."
        ),
      statusFilter: z
        .enum(["open", "done", "all"])
        .default("open")
        .optional()
        .describe(
          "Which tasks to return. 'open' = not done + in_progress (default); 'done' = completed; 'all' = everything."
        ),
      daysAgo: z
        .number()
        .min(1)
        .max(90)
        .optional()
        .describe(
          "When status is 'done' or 'all', limit completed tasks to this many days back. Defaults to 7."
        ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to list tasks from; falls back to the conversation's Pod."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing tasks",
      done: "List tasks",
    },
  },
  [CREATE_TASKS_TOOL_NAME]: {
    description:
      "Create one or more new tasks at once in the Pod. Omitting userId (or null) creates an unassigned task unless the Pod has exactly one assignable member, in which case that member is assigned. Pass userId when a specific person should own the task.",
    schema: PodTasksCreateTasksInputSchema.shape,
    stake: "low",
    displayLabels: {
      running: "Creating tasks",
      done: "Create tasks",
    },
  },
  [UPDATE_TASKS_TOOL_NAME]: {
    description: "Update one or more existing tasks at once in the Pod.",
    schema: PodTasksUpdateTasksInputSchema.shape,
    stake: "low",
    displayLabels: {
      running: "Updating tasks",
      done: "Update tasks",
    },
  },
  [START_TASK_AGENT_TOOL_NAME]: {
    description:
      "Start an agent conversation to work on one of your open tasks with status 'todo'. " +
      "If already started, it reuses the existing linked conversation.",
    schema: {
      taskId: z.string().describe("The sId of the task to start working on."),
      agentName: z
        .string()
        .min(3)
        .optional()
        .describe(
          "Optional agent name. If provided, the tool searches matching agent configurations and uses the best match. Defaults to Dust."
        ),
      customMessage: z
        .string()
        .optional()
        .describe(
          "Optional additional instructions appended to the kickoff message sent to the selected agent."
        ),
      dustPod: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD
      ]
        .optional()
        .describe(
          "Optional Pod to look up the task in; falls back to the conversation's Pod."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Starting task work",
      done: "Start task work",
    },
  },
});

export const POD_TASKS_SERVER = {
  serverInfo: {
    name: POD_TASKS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Manage Pod tasks: list, create, update, and complete action items.",
    icon: "ActionCheckCircleIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(POD_TASKS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POD_TASKS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

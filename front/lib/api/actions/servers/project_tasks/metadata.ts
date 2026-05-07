import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_TASKS_SERVER_NAME = "project_tasks" as const;

export const PROJECT_TASKS_TOOLS_METADATA = createToolsRecord({
  list_tasks: {
    description:
      "List tasks in the project. " +
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
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to list tasks from; falls back to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing tasks",
      done: "List tasks",
    },
  },
  create_tasks: {
    description:
      "Create one or more new tasks at once in the project. Omitting userId (or null) creates an unassigned task unless the project has exactly one assignable member, in which case that member is assigned. Pass userId when a specific person should own the task.",
    schema: {
      creatorType: z
        .enum(["user", "agent"])
        .describe(
          "Who is initiating the task creation? Use 'user' when the user explicitly asked for it."
        ),
      tasks: z
        .array(
          z.object({
            text: z
              .string()
              .min(16)
              .max(256)
              .describe(
                "The task description. Do not include the assignee's name — " +
                  "the assignee is tracked separately via userId. Refer to the " +
                  "assignee with 'you'/'your' pronouns when needed."
              ),
            userId: z
              .union([z.string(), z.null()])
              .optional()
              .describe(
                "Project member's user sId to assign this task to. Omit userId entirely (or use null) for an unassigned task, unless the project has exactly one assignable member (then that member is assigned)."
              ),
            doneRationale: z
              .string()
              .optional()
              .describe(
                "The rationale for marking the task as done. Leave empty if the task should not be marked as done."
              ),
          })
        )
        .min(1)
        .max(30)
        .describe("List of tasks to create (max 30)."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to create the tasks in; falls back to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating tasks",
      done: "Create tasks",
    },
  },
  mark_task_done: {
    description: "Mark one or more tasks as done.",
    schema: {
      actorType: z
        .enum(["user", "agent"])
        .describe(
          "Who is marking the task done? Use 'user' when the user explicitly asked for it."
        ),
      taskIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("List of task sIds to mark as done."),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to resolve tasks in; falls back to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Marking tasks as done",
      done: "Mark tasks as done",
    },
  },
  update_task: {
    description: "Update a task.",
    schema: {
      taskId: z.string().describe("The sId of the task."),
      text: z
        .string()
        .min(16)
        .max(256)
        .optional()
        .describe("The new task description."),
      userId: z
        .string()
        .optional()
        .describe(
          "The sId of the user to assign the task to; must be a member of the project. Defaults to the current user."
        ),
      doneRationale: z
        .string()
        .optional()
        .describe(
          "The rationale for marking the task as done. Leave empty if the task should not be marked as done."
        ),
      status: z
        .enum(["todo", "in_progress", "done"])
        .optional()
        .describe("The new task status. Defaults to the current status."),

      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to look up the task in; falls back to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Updating task",
      done: "Update task",
    },
  },
  start_task_agent: {
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
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to look up the task in; falls back to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Starting task work",
      done: "Start task work",
    },
  },
});

export const PROJECT_TASKS_SERVER = {
  serverInfo: {
    name: PROJECT_TASKS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Manage project tasks: list, create, update, and complete action items.",
    icon: "ActionListCheckIcon",
    authorization: null,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(PROJECT_TASKS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_TASKS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;

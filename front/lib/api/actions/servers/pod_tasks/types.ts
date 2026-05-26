import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

const PodTasksDustPodInputSchema =
  ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
  ].optional();

export const PodTasksCreateTaskSourceInputSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      "URL of a related source (e.g. Slack thread, GitHub issue, Notion page)"
    ),
  title: z.string().describe("Human-readable title for the source"),
});

export const PodTasksCreateTaskInputSchema = z.object({
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
      "Pod member's user sId to assign this task to. Omit userId entirely (or use null) for an unassigned task, unless the Pod has exactly one assignable member (then that member is assigned)."
    ),
  doneRationale: z
    .string()
    .optional()
    .describe(
      "The rationale for marking the task as done. Leave empty if the task should not be marked as done."
    ),
  sources: z
    .array(PodTasksCreateTaskSourceInputSchema)
    .optional()
    .describe(
      "Optional context sources to attach to this task when the agent can provide them"
    ),
});

export const PodTasksCreateTasksInputSchema = z.object({
  creatorType: z
    .enum(["user", "agent"])
    .describe(
      "Who is initiating the task creation? Use 'user' when the user explicitly asked for it."
    ),
  tasks: z
    .array(PodTasksCreateTaskInputSchema)
    .min(1)
    .max(30)
    .describe("List of tasks to create (max 30)."),
  dustPod: PodTasksDustPodInputSchema.describe(
    "Optional Pod to create the tasks in; falls back to the conversation's Pod."
  ),
});

export type PodTasksCreateTasksInput = z.infer<
  typeof PodTasksCreateTasksInputSchema
>;

export function isPodTasksCreateTasksInput(
  input: Record<string, unknown>
): input is PodTasksCreateTasksInput {
  return PodTasksCreateTasksInputSchema.safeParse(input).success;
}

export const PodTasksUpdateTaskItemInputSchema = z.object({
  taskId: z.string().describe("The sId of the task to update."),
  text: z
    .string()
    .min(16)
    .max(256)
    .optional()
    .describe("The new task description."),
  userId: z
    .union([z.string(), z.null()])
    .optional()
    .describe(
      "The sId of the user to assign the task to; must be a member of the Pod. Pass null to unassign. Omit to keep the current assignee."
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
});

export const PodTasksUpdateTasksInputSchema = z.object({
  tasks: z
    .array(PodTasksUpdateTaskItemInputSchema)
    .min(1)
    .max(30)
    .describe("List of tasks to update (max 30)."),
  dustPod: PodTasksDustPodInputSchema.describe(
    "Optional Pod to look up the tasks in; falls back to the conversation's Pod."
  ),
});

export type PodTasksUpdateTasksInput = z.infer<
  typeof PodTasksUpdateTasksInputSchema
>;

export type PodTasksUpdateTaskItemInput = z.infer<
  typeof PodTasksUpdateTaskItemInputSchema
>;

export function isPodTasksUpdateTasksInput(
  input: Record<string, unknown>
): input is PodTasksUpdateTasksInput {
  return PodTasksUpdateTasksInputSchema.safeParse(input).success;
}

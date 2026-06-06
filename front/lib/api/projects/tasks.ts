// Shared contract types and schemas for the project_tasks API endpoints.
// Imported by both the Next.js handlers (front/pages/api/...) and their Hono
// counterparts (front-api/routes/...) so there is a single source of truth.
import type { PodTaskType } from "@app/types/project_task";
import { POD_TASK_STATUSES } from "@app/types/project_task";
import type { PodType } from "@app/types/space";
import { z } from "zod";

export const PatchProjectTaskBodySchema = z
  .object({
    text: z
      .string()
      .min(1, "Text cannot be empty.")
      .max(256, "Text must be at most 256 characters.")
      .optional(),
    status: z.enum(POD_TASK_STATUSES).optional(),
    assigneeUserId: z.union([z.string().min(1), z.null()]).optional(),
  })
  .refine(
    (data) =>
      data.text !== undefined ||
      data.status !== undefined ||
      data.assigneeUserId !== undefined,
    {
      message:
        "At least one of text, status, or assigneeUserId must be provided.",
    }
  );

export interface PatchPodTaskResponseBody {
  task: PodTaskType;
}

export type DeletePodTaskResponseBody = never;

export const PostStartPodTaskBodySchema = z.object({
  customMessage: z.string().optional(),
  agentConfigurationId: z.string().optional(),
});

export interface PostStartPodTaskResponseBody {
  task: PodTaskType;
}

export type BulkActionsResponse = {
  success: boolean;
};

export const BulkActionsBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    taskIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(POD_TASK_STATUSES),
  }),
  z.object({
    action: z.literal("approve_agent_suggestion"),
    taskIds: z.array(z.string().min(1)).min(1).max(200),
  }),
  z.object({
    action: z.literal("reject_agent_suggestion"),
    taskIds: z.array(z.string().min(1)).min(1).max(200),
  }),
]);

export type BulkActionsBody = z.infer<typeof BulkActionsBodySchema>;

export const PostPodTaskBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required.")
    .max(256, "Text must be at most 256 characters."),
  /** Omit to assign to the current user; pass `null` for unassigned (or the sole assignable member if the pod has exactly one). */
  assigneeUserId: z.union([z.string().min(1), z.null()]).optional(),
});

export interface GetPodTasksResponseBody {
  tasks: PodTaskType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
}

export interface PostPodTaskResponseBody {
  task: PodTaskType;
}

export interface GetWorkspacePodTaskResponseBody {
  task: PodTaskType;
  /** Pod space (same shape as entries in `GET /api/w/{wId}/spaces` for pods). */
  space: PodType;
}

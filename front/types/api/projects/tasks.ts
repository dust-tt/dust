// Shared contract types and schemas for the project_tasks API endpoints.
// Imported by the project_tasks API routes (front-api/routes/...) so there is
// a single source of truth.
import type { PodTaskType } from "@app/types/project_task";
import { POD_TASK_STATUSES } from "@app/types/project_task";
import type { PodType } from "@app/types/space";
import { z } from "zod";

export interface PatchPodTaskResponseBody {
  task: PodTaskType;
}

export interface PostStartPodTaskResponseBody {
  task: PodTaskType;
}

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

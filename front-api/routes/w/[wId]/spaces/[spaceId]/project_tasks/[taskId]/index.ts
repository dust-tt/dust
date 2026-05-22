import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { ProjectTaskType } from "@app/types/project_task";
import { PROJECT_TASK_STATUSES } from "@app/types/project_task";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { z } from "zod";

import start from "./start";

// `ProjectTaskType` declares several `Date` fields (`doneAt`,
// `agentSuggestionReviewedAt`, `createdAt`, `updatedAt`). On the wire these
// JSON-serialize to ISO strings, so the response body overrides those fields
// as `string`. Consumers already accept `Date | string` via
// `formatFriendlyDate(...)`.
export interface PatchProjectTaskResponseBody {
  task: Omit<
    ProjectTaskType,
    "doneAt" | "agentSuggestionReviewedAt" | "createdAt" | "updatedAt"
  > & {
    doneAt: string | null;
    agentSuggestionReviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

const PatchProjectTaskBodySchema = z
  .object({
    text: z
      .string()
      .min(1, "Text cannot be empty.")
      .max(256, "Text must be at most 256 characters.")
      .optional(),
    status: z.enum(PROJECT_TASK_STATUSES).optional(),
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

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/:taskId.
const app = workspaceApp();

app.patch(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PatchProjectTaskBodySchema),
  async (ctx): HandlerResult<PatchProjectTaskResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const taskId = ctx.req.param("taskId") ?? "";

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Tasks are only available for project spaces.",
        },
      });
    }

    const task = await ProjectTaskResource.fetchBySId(auth, taskId);
    if (!task || task.spaceId !== space.id) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "project_task_not_found",
          message: "Task not found.",
        },
      });
    }

    const user = auth.getNonNullableUser();
    const { text, status, assigneeUserId } = ctx.req.valid("json");
    const workspace = auth.getNonNullableWorkspace();

    const updates: Parameters<typeof task.updateWithVersion>[1] = {};

    if (text !== undefined) {
      updates.text = text;
    }

    if (status !== undefined) {
      updates.status = status;
      if (status === "done") {
        updates.markedAsDoneByType = "user";
        updates.markedAsDoneByUserId = user.id;
        updates.markedAsDoneByAgentConfigurationId = null;
        updates.doneAt = new Date();
      } else {
        // Clearing done status — reset all done-by fields.
        updates.markedAsDoneByType = null;
        updates.markedAsDoneByUserId = null;
        updates.markedAsDoneByAgentConfigurationId = null;
        updates.doneAt = null;
      }
    }

    if (assigneeUserId !== undefined) {
      if (assigneeUserId === null) {
        updates.userId = null;
      } else {
        const assigneeAuth = await Authenticator.fromUserIdAndWorkspaceId(
          assigneeUserId,
          workspace.sId
        );
        const assigneeUser = assigneeAuth.user();
        if (!assigneeUser) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Assignee user not found.",
            },
          });
        }
        if (!space.isMember(assigneeAuth)) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Assignee must be a member of this project.",
            },
          });
        }
        updates.userId = assigneeUser.id;
      }
    }

    const updatedTask = await task.updateWithVersion(auth, updates);
    const taskResource =
      (await ProjectTaskResource.fetchBySId(auth, updatedTask.sId)) ??
      updatedTask;
    const conversationId = await taskResource.getLatestConversationId(auth);

    return ctx.json({
      task: {
        ...taskResource.toJSON(),
        conversationId,
      },
    });
  }
);

app.delete("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const taskId = ctx.req.param("taskId") ?? "";

  if (!space.isProject()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tasks are only available for project spaces.",
      },
    });
  }

  const task = await ProjectTaskResource.fetchBySId(auth, taskId);
  if (!task || task.spaceId !== space.id) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "project_task_not_found",
        message: "Task not found.",
      },
    });
  }

  await task.softDelete(auth);

  return ctx.body(null, 204);
});

app.route("/start", start);

export default app;

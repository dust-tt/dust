import { Authenticator } from "@app/lib/auth";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { PROJECT_TASK_STATUSES } from "@app/types/project_task";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import start from "./start";

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
const app = new Hono();

app.patch(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", PatchProjectTaskBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const taskId = c.req.param("taskId") ?? "";

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Tasks are only available for project spaces.",
        },
      });
    }

    const task = await ProjectTaskResource.fetchBySId(auth, taskId);
    if (!task || task.spaceId !== space.id) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "project_task_not_found",
          message: "Task not found.",
        },
      });
    }

    const user = auth.getNonNullableUser();
    const { text, status, assigneeUserId } = c.req.valid("json");
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
          return apiError(c, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Assignee user not found.",
            },
          });
        }
        if (!space.isMember(assigneeAuth)) {
          return apiError(c, {
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

    return c.json({
      task: {
        ...taskResource.toJSON(),
        conversationId,
      },
    });
  }
);

app.delete("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const taskId = c.req.param("taskId") ?? "";

  if (!space.isProject()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tasks are only available for project spaces.",
      },
    });
  }

  const task = await ProjectTaskResource.fetchBySId(auth, taskId);
  if (!task || task.spaceId !== space.id) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "project_task_not_found",
        message: "Task not found.",
      },
    });
  }

  await task.softDelete(auth);

  return c.body(null, 204);
});

app.route("/start", start);

export default app;

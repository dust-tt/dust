import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { BulkActionsBodySchema } from "@app/types/api/projects/tasks";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/bulk-actions.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", BulkActionsBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Tasks are only available for project spaces.",
        },
      });
    }

    const body = ctx.req.valid("json");

    switch (body.action) {
      case "set_status": {
        const user = auth.getNonNullableUser();
        const updates: Parameters<ProjectTaskResource["updateWithVersion"]>[1] =
          body.status === "done"
            ? {
                status: body.status,
                doneAt: new Date(),
                markedAsDoneByType: "user",
                markedAsDoneByUserId: user.id,
                markedAsDoneByAgentConfigurationId: null,
              }
            : {
                status: body.status,
                doneAt: null,
                markedAsDoneByType: null,
                markedAsDoneByUserId: null,
                markedAsDoneByAgentConfigurationId: null,
              };

        const result = await ProjectTaskResource.bulkUpdateWithVersionBySIds(
          auth,
          { sIds: body.taskIds, spaceId: space.id, updates }
        );

        if (result.isErr()) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        }

        return ctx.json({ success: true });
      }

      case "approve_agent_suggestion": {
        const user = auth.getNonNullableUser();
        // Approve in reverse so the first-listed task is saved last and keeps
        // the latest `updatedAt`, preserving display order under the client's
        // `updatedAt desc` initial sort (matches `seedInitialPodTasks`).
        for (const sId of [...body.taskIds].reverse()) {
          const todo = await ProjectTaskResource.fetchBySId(auth, sId);
          if (
            !todo ||
            todo.spaceId !== space.id ||
            todo.agentSuggestionStatus !== "pending"
          ) {
            continue;
          }
          await todo.approveAgentSuggestion(auth, {
            reviewedByUserId: user.id,
          });
        }
        return ctx.json({ success: true });
      }

      case "reject_agent_suggestion": {
        const user = auth.getNonNullableUser();
        for (const sId of body.taskIds) {
          const todo = await ProjectTaskResource.fetchBySId(auth, sId);
          if (
            !todo ||
            todo.spaceId !== space.id ||
            todo.agentSuggestionStatus !== "pending"
          ) {
            continue;
          }
          await todo.rejectAgentSuggestion(auth, {
            reviewedByUserId: user.id,
          });
        }
        return ctx.json({ success: true });
      }

      default:
        assertNever(body);
    }
  }
);

export default app;

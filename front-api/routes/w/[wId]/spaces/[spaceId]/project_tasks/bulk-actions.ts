import { Hono } from "hono";
import { z } from "zod";

import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { PROJECT_TASK_STATUSES } from "@app/types/project_task";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const BulkActionsBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    taskIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(PROJECT_TASK_STATUSES),
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

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/bulk-actions.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", BulkActionsBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Tasks are only available for project spaces.",
          },
        },
        400
      );
    }

    const body = c.req.valid("json");

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
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            },
            400
          );
        }

        return c.json({ success: true });
      }

      case "approve_agent_suggestion": {
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
          await todo.approveAgentSuggestion(auth, {
            reviewedByUserId: user.id,
          });
        }
        return c.json({ success: true });
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
        return c.json({ success: true });
      }

      default:
        assertNever(body);
    }
  }
);

export default app;

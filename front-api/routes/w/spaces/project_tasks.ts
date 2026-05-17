import { Hono } from "hono";
import { z } from "zod";

import type { ContentfulStatusCode } from "hono/utils/http-status";
import { startAgentForProjectTask } from "@app/lib/project_task/start_agent";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import type { APIErrorType } from "@app/types/error";

import { spaceResource } from "../../../middleware/space_resource";
import { validate } from "../../../middleware/validator";

const PostStartProjectTaskBodySchema = z.object({
  customMessage: z.string().optional(),
  agentConfigurationId: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks.
export const projectTasksApp = new Hono();

projectTasksApp.post(
  "/mark_read",
  spaceResource({ requireCanRead: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Todos are only available for project spaces.",
          },
        },
        400
      );
    }

    await ProjectTaskStateResource.upsertBySpace(auth, {
      spaceId: space.id,
      lastReadAt: new Date(),
    });

    return c.json({ success: true });
  }
);

projectTasksApp.post(
  "/:taskId/start",
  spaceResource({ requireCanRead: true }),
  validate("json", PostStartProjectTaskBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const taskId = c.req.param("taskId") ?? "";

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

    const { customMessage, agentConfigurationId } = c.req.valid("json");
    const startRes = await startAgentForProjectTask(auth, {
      space,
      taskId,
      customMessage,
      agentConfigurationId,
    });
    if (startRes.isErr()) {
      return c.json(
        {
          error: {
            type: startRes.error.type as APIErrorType,
            message: startRes.error.message,
          },
        },
        startRes.error.statusCode as ContentfulStatusCode
      );
    }

    return c.json({ task: startRes.value.task });
  }
);

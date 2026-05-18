import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

import { startAgentForProjectTask } from "@app/lib/project_task/start_agent";
import type { APIErrorType } from "@app/types/error";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const PostStartProjectTaskBodySchema = z.object({
  customMessage: z.string().optional(),
  agentConfigurationId: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/:taskId/start.
const app = new Hono();

app.post(
  "/",
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

export default app;

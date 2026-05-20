import { startAgentForProjectTask } from "@app/lib/project_task/start_agent";
import type { APIErrorType } from "@app/types/error";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostStartProjectTaskBodySchema = z.object({
  customMessage: z.string().optional(),
  agentConfigurationId: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/:taskId/start.
const app = new Hono();

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", PostStartProjectTaskBodySchema),
  async (ctx) => {
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

    const { customMessage, agentConfigurationId } = ctx.req.valid("json");
    const startRes = await startAgentForProjectTask(auth, {
      space,
      taskId,
      customMessage,
      agentConfigurationId,
    });
    if (startRes.isErr()) {
      return apiError(ctx, {
        status_code: startRes.error.statusCode,
        api_error: {
          type: startRes.error.type as APIErrorType,
          message: startRes.error.message,
        },
      });
    }

    return ctx.json({ task: startRes.value.task });
  }
);

export default app;

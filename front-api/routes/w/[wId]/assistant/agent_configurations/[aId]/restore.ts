import { AgentResource } from "@app/lib/resources/agent_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/restore.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Could not find the agent configuration.",
        },
      });
    }

    // Authorization is enforced inside `restore` (the agent `admin` verb): a caller that lacks it
    // gets the `unauthorized` error mapped to 403 below.
    const restoredResult = await agent.restore(auth);

    if (restoredResult.isErr()) {
      switch (restoredResult.error.code) {
        case "name_conflict":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: restoredResult.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: restoredResult.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Could not restore the agent configuration.",
            },
          });
        default:
          assertNever(restoredResult.error.code);
      }
    }

    if (!restoredResult.value.restored) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Could not restore the agent configuration.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;

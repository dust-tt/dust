import {
  TriggerExecutionModeForbiddenError,
  TriggerResource,
} from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { PatchTriggerExecutionModeRequestBodySchema } from "@app/types/api/assistant/configuration/triggers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/w/:wId/triggers/:tId/execution_mode.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchTriggerExecutionModeRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");
    const { executionMode } = ctx.req.valid("json");

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: "Trigger not found.",
        },
      });
    }

    const result = await trigger.setExecutionMode(auth, executionMode);
    if (result.isErr()) {
      if (result.error instanceof TriggerExecutionModeForbiddenError) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: result.error.message,
          },
        });
      }

      logger.error(
        { error: result.error, tId, executionMode },
        "Error updating trigger execution mode"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update the trigger pool.",
        },
      });
    }

    return ctx.body(null, 204);
  }
);

export default app;

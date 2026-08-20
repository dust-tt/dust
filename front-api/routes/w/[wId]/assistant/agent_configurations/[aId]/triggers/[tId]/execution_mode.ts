import { getFeatureFlags } from "@app/lib/auth";
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
  aId: z.string(),
  tId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId/execution_mode.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchTriggerExecutionModeRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId, tId } = ctx.req.valid("param");
    const { executionMode } = ctx.req.valid("json");

    const featureFlags = await getFeatureFlags(auth);
    if (!featureFlags.includes("trigger_pool_choice")) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "feature_flag_not_found",
          message: "The trigger pool choice feature is not enabled.",
        },
      });
    }

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

    if (trigger.agentConfigurationId !== aId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Trigger does not belong to the specified agent configuration.",
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
        { error: result.error, aId, tId, executionMode },
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

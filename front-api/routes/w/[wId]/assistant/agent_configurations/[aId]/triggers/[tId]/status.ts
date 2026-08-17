import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import { PatchTriggerStatusRequestBodySchema } from "@app/types/api/assistant/configuration/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  tId: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/triggers/:tId/status.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchTriggerStatusRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId, tId } = ctx.req.valid("param");
    const { status } = ctx.req.valid("json");

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

    if (!auth.isAdmin() && trigger.editor !== auth.getNonNullableUser().id) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "Only admins or the editor of the trigger can change its status.",
        },
      });
    }

    if (trigger.isSystemDisabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "This automation is managed by Dust and cannot be toggled.",
        },
      });
    }

    if (!trigger.canUpdateStatusTo(auth, status)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "This trigger was disabled by an admin and only an admin can change its status.",
        },
      });
    }

    let result;
    switch (status) {
      case "enabled":
        result = await trigger.enable(auth);
        break;
      case "disabled":
        result = await trigger.disable(
          auth,
          auth.isAdmin() ? "disabled_by_admin" : "disabled"
        );
        break;
      default:
        assertNever(status);
    }

    if (result.isErr()) {
      logger.error(
        { error: result.error, aId, tId, targetStatus: status },
        "Error updating trigger status"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update the trigger status.",
        },
      });
    }

    return ctx.body(null, 204);
  }
);

export default app;

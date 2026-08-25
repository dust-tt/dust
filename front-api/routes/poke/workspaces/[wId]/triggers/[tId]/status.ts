import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { PatchTriggerStatusRequestBodySchema } from "@app/types/api/assistant/configuration/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/status.
const app = pokeApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchTriggerStatusRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");
    const { status } = ctx.req.valid("json");
    const action = status === "enabled" ? "enable" : "disable";

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: "The trigger was not found.",
        },
      });
    }

    if (trigger.isSystemStatusTransitionTo(status)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "This trigger's status is managed by Dust and cannot be changed.",
        },
      });
    }

    let result;
    switch (status) {
      case "enabled":
        result = await trigger.enable(auth);
        break;
      case "disabled":
        result = await trigger.disable(auth, "disabled_by_manager");
        break;
      default:
        assertNever(status);
    }

    if (result.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to ${action} the trigger.`,
          },
        },
        result.error
      );
    }

    return ctx.body(null, 204);
  }
);

export default app;

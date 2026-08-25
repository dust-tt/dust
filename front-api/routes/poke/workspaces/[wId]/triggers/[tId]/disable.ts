import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/disable.
const app = pokeApp();

/** @ignoreswagger */
app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { tId } = ctx.req.valid("param");

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

  if (
    trigger.status !== "enabled" &&
    trigger.status !== "disabled_by_manager"
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This trigger cannot be disabled from its current status.",
      },
    });
  }

  const result = await trigger.disable(auth, "disabled_by_manager");
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to disable the trigger.",
        },
      },
      result.error
    );
  }

  return ctx.body(null, 204);
});

export default app;

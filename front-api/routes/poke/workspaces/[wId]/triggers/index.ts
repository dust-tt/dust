import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tId from "./[tId]";
import search from "./search";

const DeleteTriggerQuerySchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers.
const app = pokeApp();

/** @ignoreswagger */
app.delete("/", validate("query", DeleteTriggerQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { tId } = ctx.req.valid("query");

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

  const deleteResult = await trigger.delete(auth);
  if (deleteResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete trigger.",
      },
    });
  }

  return ctx.body(null, 204);
});

app.route("/search", search);
app.route("/:tId", tId);

export default app;

import { TriggerResource } from "@app/lib/resources/trigger_resource";
import {
  listTriggersWithProviderAndEditor,
  type TriggerWithProviderAndEditor,
} from "@app/lib/triggers/admin/list_with_metadata";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

import tId from "./[tId]";

export type TriggerWithProviderType = TriggerWithProviderAndEditor;

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

const DeleteTriggerQuerySchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeListTriggers> => {
  const auth = ctx.get("auth");

  const triggers = await listTriggersWithProviderAndEditor(auth);

  return ctx.json({ triggers });
});

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

app.route("/:tId", tId);

export default app;

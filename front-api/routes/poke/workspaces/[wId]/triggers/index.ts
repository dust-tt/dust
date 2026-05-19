import { Hono } from "hono";
import { z } from "zod";

import {
  listTriggersWithProviderAndEditor,
  type TriggerWithProviderAndEditor,
} from "@app/lib/triggers/admin/list_with_metadata";
import { TriggerResource } from "@app/lib/resources/trigger_resource";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

import tId from "./[tId]";

export type TriggerWithProviderType = TriggerWithProviderAndEditor;

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

const DeleteTriggerQuerySchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const triggers = await listTriggersWithProviderAndEditor(auth);

  const body: PokeListTriggers = { triggers };
  return c.json(body);
});

app.delete("/", validate("query", DeleteTriggerQuerySchema), async (c) => {
  const auth = c.get("auth");
  const { tId } = c.req.valid("query");

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found.",
      },
    });
  }

  const deleteResult = await trigger.delete(auth);
  if (deleteResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete trigger.",
      },
    });
  }

  return c.body(null, 204);
});

app.route("/:tId", tId);

export default app;

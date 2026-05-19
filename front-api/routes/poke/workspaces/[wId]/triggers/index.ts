import { Hono } from "hono";
import { z } from "zod";

import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { TriggerType } from "@app/types/assistant/triggers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

import tId from "./[tId]";

export type TriggerWithProviderType = TriggerType & {
  provider?: WebhookProvider | null;
  editorUser?: UserType | null;
};

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

  const triggers = await TriggerResource.listByWorkspace(auth);
  const triggerJSONs = triggers.map((t) => t.toJSON());

  const webhookSourceViewIds = removeNulls(
    triggerJSONs.map((t) =>
      t.kind === "webhook" ? t.webhookSourceViewId : null
    )
  );

  const webhookSourceViews =
    webhookSourceViewIds.length > 0
      ? await WebhookSourcesViewResource.fetchByIds(auth, webhookSourceViewIds)
      : [];

  const providerMap = new Map<string, WebhookProvider | null>();
  for (const view of webhookSourceViews) {
    const viewJSON = view.toJSON();
    providerMap.set(viewJSON.sId, viewJSON.provider);
  }

  const editorIds = removeNulls(triggerJSONs.map((t) => t.editor));
  const editorUsers =
    editorIds.length > 0 ? await UserResource.fetchByModelIds(editorIds) : [];
  const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

  const triggersWithProvider: TriggerWithProviderType[] = triggerJSONs.map(
    (t) => {
      const editorUser = editorUserMap.get(t.editor) ?? null;
      if (t.kind === "webhook" && t.webhookSourceViewId) {
        return {
          ...t,
          provider: providerMap.get(t.webhookSourceViewId) ?? null,
          editorUser,
        };
      }
      return {
        ...t,
        provider: t.kind === "schedule" ? undefined : null,
        editorUser,
      };
    }
  );

  const body: PokeListTriggers = { triggers: triggersWithProvider };
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

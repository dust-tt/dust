import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

import wsId from "./[wsId]";

export type PokeListWebhookSources = {
  webhookSources: Array<
    WebhookSourceType & { viewCount: number; triggerCount: number }
  >;
};

// Mounted at /api/poke/workspaces/:wId/webhook_sources.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeListWebhookSources> => {
  const auth = ctx.get("auth");

  const sources = await WebhookSourceResource.listByWorkspace(auth);
  const results: PokeListWebhookSources["webhookSources"] = [];

  for (const source of sources) {
    const views = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      source.id
    );
    let triggerCount = 0;
    for (const view of views) {
      const triggers = await TriggerResource.listByWebhookSourceViewId(
        auth,
        view.id
      );
      triggerCount += triggers.length;
    }

    results.push({
      ...source.toJSON(),
      viewCount: views.length,
      triggerCount,
    });
  }

  return ctx.json({ webhookSources: results });
});

app.route("/:wsId", wsId);

export default app;

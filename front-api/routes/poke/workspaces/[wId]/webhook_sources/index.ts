import { listWebhookSourcesWithCounts } from "@app/lib/api/webhook_source";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import wsId from "./[wsId]";

export type PokeListWebhookSources = {
  webhookSources: Array<
    WebhookSourceType & { viewCount: number; triggerCount: number }
  >;
};

// Mounted at /api/poke/workspaces/:wId/webhook_sources.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListWebhookSources> => {
  const auth = ctx.get("auth");

  const webhookSources = await listWebhookSourcesWithCounts(auth);

  return ctx.json({ webhookSources });
});

app.route("/:wsId", wsId);

export default app;

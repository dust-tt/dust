import type { PokeListWebhookSources } from "@app/lib/api/poke/webhook_sources";
import { listWebhookSourcesWithCounts } from "@app/lib/api/webhook_source";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import wsId from "./[wsId]";

// Mounted at /api/poke/workspaces/:wId/webhook_sources.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListWebhookSources> => {
  const auth = ctx.get("auth");

  const webhookSources = await listWebhookSourcesWithCounts(auth);

  return ctx.json({ webhookSources });
});

app.route("/:wsId", wsId);

export default app;

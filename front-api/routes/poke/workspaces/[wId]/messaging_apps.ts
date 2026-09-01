import type { PokeGetMessagingApps } from "@app/lib/api/poke/messaging_apps";
import { getPokeMessagingApps } from "@app/lib/api/poke/messaging_apps";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/messaging_apps.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetMessagingApps> => {
  const auth = ctx.get("auth");

  return ctx.json({ messagingApps: await getPokeMessagingApps(auth) });
});

export default app;

import type { PokeListApps } from "@app/lib/api/poke/apps";
import { AppResource } from "@app/lib/resources/app_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import aId from "./[aId]";
import importApp from "./import";

// Mounted at /api/poke/workspaces/:wId/apps. pokeAuth is applied by
// the parent workspaces/[wId] sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListApps> => {
  const auth = ctx.get("auth");
  const apps = await AppResource.listByWorkspace(auth);

  return ctx.json({ apps: apps.map((a) => a.toJSON()) });
});

// Literal segments before param segments.
app.route("/import", importApp);
app.route("/:aId", aId);

export default app;

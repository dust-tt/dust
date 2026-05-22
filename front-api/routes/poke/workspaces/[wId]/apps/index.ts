import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

import aId from "./[aId]";
import importApp from "./import";

export type PokeListApps = {
  apps: AppType[];
};

// Mounted at /api/poke/workspaces/:wId/apps. pokeWorkspaceAuth is applied by
// the parent workspaces/[wId] sub-app.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeListApps> => {
  const auth = ctx.get("auth");
  const apps = await AppResource.listByWorkspace(auth);

  return ctx.json({ apps: apps.map((a) => a.toJSON()) });
});

// Literal segments before param segments.
app.route("/import", importApp);
app.route("/:aId", aId);

export default app;

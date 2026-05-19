import { Hono } from "hono";

import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";

import aId from "./[aId]";
import importApp from "./import";

export type PokeListApps = {
  apps: AppType[];
};

// Mounted at /api/poke/workspaces/:wId/apps. pokeWorkspaceAuth is applied by
// the parent workspaces/[wId] sub-app.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const apps = await AppResource.listByWorkspace(auth);

  const body: PokeListApps = { apps: apps.map((a) => a.toJSON()) };
  return c.json(body);
});

// Literal segments before param segments.
app.route("/import", importApp);
app.route("/:aId", aId);

export default app;

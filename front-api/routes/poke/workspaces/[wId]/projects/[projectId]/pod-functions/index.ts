import { listProjectPodFunctions } from "@app/lib/api/poke/pod_functions";
import type { PokeListProjectPodFunctions } from "@app/lib/api/poke/projects";
import { pokeProjectApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import functionId from "./[functionId]";

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/pod-functions.
const app = pokeProjectApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListProjectPodFunctions> => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  const items = await listProjectPodFunctions(auth, space);

  return ctx.json({ items });
});

app.route("/:functionId", functionId);

export default app;

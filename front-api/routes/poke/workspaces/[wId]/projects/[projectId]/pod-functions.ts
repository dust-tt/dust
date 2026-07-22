import type { PokeListProjectPodFunctions } from "@app/lib/api/poke/projects";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { pokeProjectApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/pod-functions.
const app = pokeProjectApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListProjectPodFunctions> => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    space
  );
  const items = sandboxFunctions.map((sandboxFunction) =>
    sandboxFunction.toPokeJSON()
  );

  return ctx.json({ items });
});

export default app;

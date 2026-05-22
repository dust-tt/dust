import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type PokeListSpaces = {
  spaces: SpaceType[];
};

// Mounted at /api/poke/workspaces/:wId/spaces.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeListSpaces> => {
  const auth = ctx.get("auth");

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  return ctx.json({ spaces: spaces.map((s) => s.toJSON()) });
});

export default app;

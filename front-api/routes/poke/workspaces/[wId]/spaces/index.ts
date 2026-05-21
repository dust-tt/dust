import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import spaceId from "./[spaceId]";

export type PokeListSpaces = {
  spaces: SpaceType[];
};

// Mounted at /api/poke/workspaces/:wId/spaces.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListSpaces> => {
  const auth = ctx.get("auth");

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  return ctx.json({ spaces: spaces.map((s) => s.toJSON()) });
});

app.route("/:spaceId", spaceId);

export default app;

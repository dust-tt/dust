import type { PokeListSpaces } from "@app/lib/api/poke/spaces";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import spaceId from "./[spaceId]";

// Mounted at /api/poke/workspaces/:wId/spaces.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListSpaces> => {
  const auth = ctx.get("auth");

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  return ctx.json({ spaces: spaces.map((s) => s.toJSON()) });
});

app.route("/:spaceId", spaceId);

export default app;

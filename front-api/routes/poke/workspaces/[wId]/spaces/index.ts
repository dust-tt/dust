import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeListSpaces = {
  spaces: SpaceType[];
};

// Mounted at /api/poke/workspaces/:wId/spaces.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeListSpaces> => {
  const auth = ctx.get("auth");

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);

  return ctx.json({ spaces: spaces.map((s) => s.toJSON()) });
});

export default app;

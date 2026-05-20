import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import { Hono } from "hono";

export type GetPublicSpacesResponseBody = {
  spaces: SpaceType[];
};

// Mounted at /api/v1/w/:wId/spaces. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const allSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const spaces = allSpaces.filter((space) => space.kind !== "conversations");

  const body: GetPublicSpacesResponseBody = {
    spaces: spaces.map((space) => space.toJSON()),
  };
  return ctx.json(body);
});

export default app;

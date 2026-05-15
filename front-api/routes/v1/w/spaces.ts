import { Hono } from "hono";

import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";

export type GetPublicSpacesResponseBody = {
  spaces: SpaceType[];
};

export const publicSpacesApp = new Hono();

// Mounted under /api/v1/w/:wId/spaces. publicApiAuth is applied by the parent
// v1 workspace sub-app, so c.get("auth") is always available here.
publicSpacesApp.get("/", async (c) => {
  const auth = c.get("auth");

  const allSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const spaces = allSpaces.filter((space) => space.kind !== "conversations");

  const body: GetPublicSpacesResponseBody = {
    spaces: spaces.map((space) => space.toJSON()),
  };
  return c.json(body);
});

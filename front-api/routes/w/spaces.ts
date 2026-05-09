import { Hono } from "hono";

import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectType, SpaceType } from "@app/types/space";

export type GetSpacesResponseBody = {
  spaces: (SpaceType | ProjectType)[];
};

export const spacesApp = new Hono();

// Mounted under /api/w/:wId/spaces. workspaceAuth is applied by the parent
// workspace sub-app, so c.get("auth") is always available here.
spacesApp.get("/", async (c) => {
  const auth = c.get("auth");
  const role = c.req.query("role");
  const kind = c.req.query("kind");

  let spaces: SpaceResource[] = [];
  if (role === "admin") {
    if (kind === "system") {
      const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
      spaces = systemSpace ? [systemSpace] : [];
    } else {
      spaces = await SpaceResource.listWorkspaceSpaces(auth);
    }
  } else {
    spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  }

  spaces = spaces.filter((s) => s.kind !== "conversations");
  const nonProjectSpaces = spaces.filter((s) => s.kind !== "project");
  const projectSpaces = spaces.filter((s) => s.kind === "project");

  const nonProjectsJson: SpaceType[] = nonProjectSpaces.map((s) => s.toJSON());
  const projectsJson: ProjectType[] = await enrichProjectsWithMetadata(
    auth,
    projectSpaces
  );

  const body: GetSpacesResponseBody = {
    spaces: [...nonProjectsJson, ...projectsJson],
  };
  return c.json(body);
});

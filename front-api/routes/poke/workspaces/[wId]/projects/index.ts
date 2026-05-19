import { Hono } from "hono";

import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";

import projectId from "./[projectId]";

export type PokeProjectType = SpaceType & {
  description: string | null;
  archivedAt: number | null;
  todoGenerationEnabled: boolean;
};

export type PokeListProjects = {
  projects: PokeProjectType[];
};

// Mounted at /api/poke/workspaces/:wId/projects.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const projectSpaces = await SpaceResource.listProjectSpaces(auth);

  const metadataResources = await ProjectMetadataResource.fetchBySpaceIds(
    auth,
    projectSpaces.map((s) => s.id)
  );
  const metadataBySpaceId = new Map(
    metadataResources.map((m) => [m.spaceId, m])
  );

  const projects: PokeProjectType[] = projectSpaces.map((space) => {
    const metadata = metadataBySpaceId.get(space.id);
    return {
      ...space.toJSON(),
      description: metadata?.description ?? null,
      archivedAt: metadata?.archivedAt?.getTime() ?? null,
      todoGenerationEnabled: metadata?.todoGenerationEnabled ?? false,
    };
  });

  const body: PokeListProjects = { projects };
  return c.json(body);
});

app.route("/:projectId", projectId);

export default app;

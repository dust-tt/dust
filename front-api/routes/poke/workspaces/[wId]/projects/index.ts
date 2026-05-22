import {
  listAllProjectsWithAdminMetadata,
  type ProjectWithAdminMetadata,
} from "@app/lib/api/projects/list";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import projectId from "./[projectId]";

export type PokeProjectType = ProjectWithAdminMetadata;

export type PokeListProjects = {
  projects: PokeProjectType[];
};

// Mounted at /api/poke/workspaces/:wId/projects.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListProjects> => {
  const auth = ctx.get("auth");

  const projects = await listAllProjectsWithAdminMetadata(auth);

  return ctx.json({ projects });
});

app.route("/:projectId", projectId);

export default app;

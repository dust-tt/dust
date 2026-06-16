import type { PokeListProjects } from "@app/lib/api/poke/projects";
import { listAllProjectsWithAdminMetadata } from "@app/lib/api/projects/list";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import projectId from "./[projectId]";

// Mounted at /api/poke/workspaces/:wId/projects.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListProjects> => {
  const auth = ctx.get("auth");

  const projects = await listAllProjectsWithAdminMetadata(auth);

  return ctx.json({ projects });
});

app.route("/:projectId", projectId);

export default app;

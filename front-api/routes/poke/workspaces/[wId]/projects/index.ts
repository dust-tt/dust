import { Hono } from "hono";

import {
  listAllProjectsWithAdminMetadata,
  type ProjectWithAdminMetadata,
} from "@app/lib/api/projects/list";

import projectId from "./[projectId]";

export type PokeProjectType = ProjectWithAdminMetadata;

export type PokeListProjects = {
  projects: PokeProjectType[];
};

// Mounted at /api/poke/workspaces/:wId/projects.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const projects = await listAllProjectsWithAdminMetadata(auth);

  const body: PokeListProjects = { projects };
  return c.json(body);
});

app.route("/:projectId", projectId);

export default app;

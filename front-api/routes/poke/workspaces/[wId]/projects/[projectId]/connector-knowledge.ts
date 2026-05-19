import { Hono } from "hono";

import {
  listProjectKnowledgeFromConnectors,
  type ProjectKnowledgeFromConnectorItem,
} from "@app/lib/api/projects/context";
import { SpaceResource } from "@app/lib/resources/space_resource";

import { apiError } from "@front-api/middleware/utils";

export type PokeProjectKnowledgeFromConnectorItem =
  ProjectKnowledgeFromConnectorItem;

export type PokeListProjectKnowledgeFromConnectors = {
  items: PokeProjectKnowledgeFromConnectorItem[];
};

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/connector-knowledge.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid project ID.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  }

  const items = await listProjectKnowledgeFromConnectors(auth, space);

  const body: PokeListProjectKnowledgeFromConnectors = { items };
  return c.json(body);
});

export default app;

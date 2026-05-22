import {
  listProjectKnowledgeFromConnectors,
  type ProjectKnowledgeFromConnectorItem,
} from "@app/lib/api/projects/context";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";

export type PokeProjectKnowledgeFromConnectorItem =
  ProjectKnowledgeFromConnectorItem;

export type PokeListProjectKnowledgeFromConnectors = {
  items: PokeProjectKnowledgeFromConnectorItem[];
};

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/connector-knowledge.
const app = pokeWorkspaceApp();

app.get(
  "/",
  async (ctx): HandlerResult<PokeListProjectKnowledgeFromConnectors> => {
    const auth = ctx.get("auth");
    const projectId = ctx.req.param("projectId");
    if (!projectId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid project ID.",
        },
      });
    }

    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space || !space.isProject()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Project not found.",
        },
      });
    }

    const items = await listProjectKnowledgeFromConnectors(auth, space);

    return ctx.json({ items });
  }
);

export default app;

import { Hono } from "hono";
import { z } from "zod";

import { removeContentNodeFromProject } from "@app/lib/api/projects/context";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const DeleteContentNodeBodySchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  nodeDataSourceViewId: z.string().min(1, "nodeDataSourceViewId is required"),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/content_nodes.
//
// The Next handler enforces these as project-only and require write access;
// we keep the same checks here.
const app = new Hono();

app.delete(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", DeleteContentNodeBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const { nodeId, nodeDataSourceViewId } = c.req.valid("json");

    if (!space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Only project spaces support project context knowledge removal.",
          },
        },
        400
      );
    }
    if (!space.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "workspace_auth_error",
            message: "You do not have write access to this project.",
          },
        },
        403
      );
    }

    const r = await removeContentNodeFromProject(auth, {
      space,
      nodeId,
      nodeDataSourceViewId,
    });
    if (r.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: r.error.message,
          },
        },
        500
      );
    }
    return c.json({});
  }
);

export default app;

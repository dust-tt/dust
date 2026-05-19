import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { removeContentNodesFromProject } from "@app/lib/api/projects/context";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const ContentNodeItemSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  nodeDataSourceViewId: z.string().min(1, "nodeDataSourceViewId is required"),
});

const DeleteContentNodeBodySchema = z.object({
  items: z.array(ContentNodeItemSchema),
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
    const { items } = c.req.valid("json");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only project spaces support project context knowledge removal.",
        },
      });
    }
    if (!space.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You do not have write access to this project.",
        },
      });
    }

    const r = await removeContentNodesFromProject(auth, {
      space,
      nodes: items,
    });
    if (r.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: r.error.message,
        },
      });
    }
    return c.json({});
  }
);

export default app;

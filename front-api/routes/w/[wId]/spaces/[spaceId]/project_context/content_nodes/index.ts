import { removeContentNodesFromProject } from "@app/lib/api/projects/context";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { z } from "zod";

export type DeleteProjectContextContentNodeResponseBody = Record<string, never>;

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
const app = workspaceApp();

app.delete(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", DeleteContentNodeBodySchema),
  async (ctx): HandlerResult<DeleteProjectContextContentNodeResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { items } = ctx.req.valid("json");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Only project spaces support project context knowledge removal.",
        },
      });
    }
    if (!space.canWrite(auth)) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: r.error.message,
        },
      });
    }
    return ctx.json({});
  }
);

export default app;

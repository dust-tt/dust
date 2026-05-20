import { removeFileFromProject } from "@app/lib/api/projects/context";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/files/:fileId.
//
// The Next handler enforces these as project-only and require write access;
// we keep the same checks here.
const app = new Hono();

app.delete("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");
  const fileId = ctx.req.param("fileId") ?? "";

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

  const r = await removeFileFromProject(auth, { space, fileId });
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
});

export default app;

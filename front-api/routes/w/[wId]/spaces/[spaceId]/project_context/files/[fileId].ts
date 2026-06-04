import { removeFileFromProject } from "@app/lib/api/projects/context";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  fileId: z.string(),
});

export type DeleteProjectContextFileResponseBody = Record<string, never>;

// Mounted under /api/w/:wId/spaces/:spaceId/project_context/files/:fileId.
//
// The Next handler enforces these as project-only and require write access;
// we keep the same checks here.
const app = workspaceApp();

app.delete(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<DeleteProjectContextFileResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { fileId } = ctx.req.valid("param");

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
  }
);

export default app;

import {
  deleteWorkspaceGitHubConnection,
  setWorkspaceGitHubConnection,
} from "@app/lib/api/skills/github_connection";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { GetGitHubConnectionResponseBody } from "@app/lib/skill_detection";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { SuccessResponseBody } from "@front-api/routes/types";

// Mounted at /api/w/:wId/skills/import/github-connection.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetGitHubConnectionResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  if (!(await auth.hasWorkspacePermission("create", "skill"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Accessing the skill import GitHub connection is restricted.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchById(owner.sId);
  const connection =
    (await workspace?.getSkillImportGitHubConnectedByUser()) ?? null;

  return ctx.json({ connection });
});

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");

    const body = await ctx.req.json().catch(() => null);
    const connectionId = body?.connectionId;

    if (!isString(connectionId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "connectionId is required and must be a string.",
        },
      });
    }

    const result = await setWorkspaceGitHubConnection(auth, { connectionId });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");

    const result = await deleteWorkspaceGitHubConnection(auth);

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;

import type { GitHubConnectionError } from "@app/lib/api/skills/github_connection";
import {
  deleteWorkspaceGitHubConnection,
  setWorkspaceGitHubConnection,
} from "@app/lib/api/skills/github_connection";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { GetGitHubConnectionResponseBody } from "@app/lib/skill_detection";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import {
  ensureHasWorkspacePermission,
  ensureIsAdmin,
} from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { SuccessResponseBody } from "@front-api/routes/types";

// Mounted at /api/w/:wId/skills/import/github-connection.
const app = workspaceApp();

function gitHubConnectionApiError({
  code,
  message,
}: GitHubConnectionError): APIErrorWithContentfulStatusCode {
  switch (code) {
    case "user_required":
      return {
        status_code: 401,
        api_error: { type: "user_authentication_required", message },
      };
    case "invalid_connection":
      return {
        status_code: 400,
        api_error: { type: "skill_github_connection_invalid", message },
      };
    case "workspace_not_found":
      return {
        status_code: 404,
        api_error: { type: "workspace_not_found", message },
      };
    case "save_failed":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message },
      };
    default:
      return assertNever(code);
  }
}

/** @ignoreswagger */
app.get(
  "/",
  ensureHasWorkspacePermission(
    "create",
    "skill",
    "Accessing the skill import GitHub connection is restricted.",
    "app_auth_error"
  ),
  async (ctx): HandlerResult<GetGitHubConnectionResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();

    const workspace = await WorkspaceResource.fetchById(owner.sId);
    const connection =
      (await workspace?.getSkillImportGitHubConnectedByUser()) ?? null;

    return ctx.json({ connection });
  }
);

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
      return apiError(ctx, gitHubConnectionApiError(result.error));
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
      return apiError(ctx, gitHubConnectionApiError(result.error));
    }

    return ctx.json({ success: true });
  }
);

export default app;

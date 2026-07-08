import { setWorkspaceGitHubConnection } from "@app/lib/api/skills/github_connection";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { SuccessResponseBody } from "@front-api/routes/types";

const app = workspaceApp();

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

export default app;

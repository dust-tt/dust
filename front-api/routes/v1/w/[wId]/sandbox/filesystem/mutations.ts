import { isSandboxFileSystemTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import {
  applySandboxFileSystemMutation,
  SandboxFileSystemMutationRequestSchema,
} from "@app/lib/api/sandbox/file_system_mutations";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";

const app = sandboxApp();

/**
 * @ignoreswagger
 * Internal callback used only by the root-owned sandbox filesystem adapter.
 */
app.post(
  "/",
  validate("json", SandboxFileSystemMutationRequestSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    const request = ctx.req.valid("json");

    if (!isSandboxFileSystemTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot mutate filesystem mounts.",
        },
      });
    }

    const mountAllowed = claims.fsMounts.some(
      (mount) =>
        mount.kind === request.mount.kind && mount.id === request.mount.id
    );
    if (!mountAllowed) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "The requested filesystem mount is outside token scope.",
        },
      });
    }

    if (!isResourceSId("sandbox", claims.sbId)) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token contains an invalid sandbox id.",
        },
      });
    }
    const sandboxModelId = getResourceIdFromSId(claims.sbId);
    if (sandboxModelId === null) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token contains an invalid sandbox id.",
        },
      });
    }
    const sandbox = await SandboxResource.fetchByModelIdForWorkspace(
      auth,
      sandboxModelId
    );
    if (!sandbox) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox not found.",
        },
      });
    }

    const result = await applySandboxFileSystemMutation(auth, sandbox, request);
    if (result.isErr()) {
      const statusCode =
        result.error.code === "in_progress"
          ? 409
          : result.error.code === "invalid_request"
            ? 400
            : 500;
      return apiError(ctx, {
        status_code: statusCode,
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

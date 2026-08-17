import {
  applyFileSystemOperation,
  type FileSystemOperationResponse,
  FileSystemOperationSchema,
} from "@app/lib/api/file_system/namespace";
import type { FileSystemOperationErrorCode } from "@app/lib/api/file_system/namespace_types";
import { fileSystemScopeFromSandboxClaims } from "@app/lib/api/file_system/sandbox_scope";
import { isSandboxFileSystemTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["filesystem"] }));

function statusForFileSystemError(
  code: FileSystemOperationErrorCode
): 400 | 403 | 404 | 409 {
  switch (code) {
    case "invalid_operation":
      return 400;
    case "unauthorized":
      return 403;
    case "not_found":
      return 404;
    case "already_exists":
    case "is_directory":
    case "not_directory":
    case "not_empty":
    case "stale":
      return 409;
    default:
      return assertNever(code);
  }
}

/**
 * @ignoreswagger
 * Internal syscall endpoint used only by the Dust filesystem daemon.
 */
app.post(
  "/",
  validate("json", FileSystemOperationSchema),
  async (ctx): HandlerResult<FileSystemOperationResponse> => {
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxFileSystemTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot access the filesystem.",
        },
      });
    }

    const operationRes = await applyFileSystemOperation(
      ctx.get("auth"),
      fileSystemScopeFromSandboxClaims(claims),
      ctx.req.valid("json")
    );
    if (operationRes.isErr()) {
      // The daemon uses this code for errno. The body remains the normal Dust
      // error shape so logs and manual requests stay readable.
      ctx.header("x-dust-filesystem-error", operationRes.error.code);
      return apiError(ctx, {
        status_code: statusForFileSystemError(operationRes.error.code),
        api_error: {
          type: "invalid_request_error",
          message: operationRes.error.message,
        },
      });
    }

    return ctx.json(operationRes.value, 200);
  }
);

export default app;

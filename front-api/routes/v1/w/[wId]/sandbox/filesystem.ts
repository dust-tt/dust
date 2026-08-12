import { FileResourceFileSystemBinding } from "@app/lib/api/file_system/file_resource_binding";
import {
  applyFileSystemOperation,
  FileSystemOperationSchema,
} from "@app/lib/api/file_system/namespace";
import type { FileSystemOperationErrorCode } from "@app/lib/api/file_system/namespace_types";
import { fileSystemScopeFromSandboxClaims } from "@app/lib/api/file_system/sandbox_scope";
import { isSandboxFileSystemTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";
import { apiError } from "@front-api/middlewares/utils";
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
    case "busy":
    case "not_empty":
    case "stale":
      return 409;
  }
}

/**
 * @ignoreswagger
 * Internal syscall endpoint used only by the Dust filesystem daemon.
 */
app.post("/", validate("json", FileSystemOperationSchema), async (ctx) => {
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

  const result = await applyFileSystemOperation(
    ctx.get("auth"),
    fileSystemScopeFromSandboxClaims(claims),
    new FileResourceFileSystemBinding(),
    ctx.req.valid("json")
  );
  if (result.isErr()) {
    // The daemon maps this stable code to errno. The JSON body remains the
    // normal Dust API error shape for logs and manual debugging.
    ctx.header("x-dust-filesystem-error", result.error.code);
    return apiError(ctx, {
      status_code: statusForFileSystemError(result.error.code),
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  return ctx.json(result.value, 200);
});

export default app;

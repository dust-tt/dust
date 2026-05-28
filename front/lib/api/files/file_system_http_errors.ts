import type { DustFileSystemError } from "@app/lib/api/file_system/types";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Map a DustFileSystemError to an HTTP error envelope accepted by both the
 * Next.js apiError helper and the Hono apiError helper.
 *
 * APIErrorWithContentfulStatusCode is a subtype of APIErrorWithStatusCode so
 * it satisfies both callers.
 */
export function mapFsError(
  err: DustFileSystemError
): APIErrorWithContentfulStatusCode {
  switch (err.code) {
    case "not_found":
      return {
        status_code: 404,
        api_error: { type: "file_not_found", message: err.message },
      };

    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: err.message },
      };

    case "invalid_path":
    case "legacy_path":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "already_exists":
      return {
        status_code: 409,
        api_error: { type: "invalid_request_error", message: err.message },
      };

    case "too_many_mounts":
    case "internal":
      return {
        status_code: 500,
        api_error: { type: "internal_server_error", message: err.message },
      };

    default:
      assertNever(err.code);
  }
}

import type { LiveAccessError } from "@app/lib/api/collab/live_file";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceAccessErrorToApiError } from "@front-api/middlewares/workspace_auth";

export function liveAccessErrorToApiError(
  error: LiveAccessError
): APIErrorWithContentfulStatusCode {
  switch (error.code) {
    case "not_member":
      return {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: error.message,
        },
      };
    case "workspace_unavailable":
      return workspaceAccessErrorToApiError(error.workspaceError);
    case "not_available":
      return {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: error.message,
        },
      };
    case "invalid_path":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      };
    case "unavailable":
      return {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: error.message,
        },
      };
    case "read_only":
      return {
        status_code: 403,
        api_error: {
          type: "file_read_only",
          message: error.message,
        },
      };
    case "not_markdown":
      return {
        status_code: 400,
        api_error: {
          type: "file_type_not_supported",
          message: error.message,
        },
      };
    case "too_large":
      return {
        status_code: 413,
        api_error: {
          type: "file_too_large",
          message: error.message,
        },
      };
    default:
      assertNever(error);
  }
}

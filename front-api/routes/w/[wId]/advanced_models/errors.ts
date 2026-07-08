import type { DustError } from "@app/lib/error";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";

export function advancedModelErrorToApiError(
  error: DustError
): APIErrorWithContentfulStatusCode {
  switch (error.code) {
    case "invalid_request_error":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      };
    case "user_not_found":
    case "user_not_member":
      return {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: error.message,
        },
      };
    case "group_not_found":
    case "invalid_id":
      return {
        status_code: 404,
        api_error: {
          type: "group_not_found",
          message: error.message,
        },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: error.message,
        },
      };
    default:
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      };
  }
}

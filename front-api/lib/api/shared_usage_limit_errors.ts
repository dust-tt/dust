import type { SharedUsageLimitError } from "@app/lib/api/groups/group_shared_usage_limit";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function sharedUsageLimitErrorToApiError(
  error: SharedUsageLimitError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "group_not_found":
      return {
        status_code: 404,
        api_error: { type: "group_not_found", message: error.message },
      };
    case "invalid_group_kind":
    case "invalid_threshold":
      return {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: error.message },
      };
    case "invalid_order":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_shared_usage_limit_order",
          message: error.message,
        },
      };
    case "order_changed":
      return {
        status_code: 409,
        api_error: {
          type: "shared_usage_limit_order_changed",
          message: error.message,
        },
      };
    case "unauthorized":
      return {
        status_code: 403,
        api_error: { type: "workspace_auth_error", message: error.message },
      };
    case "shared_usage_limits_not_enabled":
      return {
        status_code: 403,
        api_error: { type: "feature_flag_not_found", message: error.message },
      };
    default:
      assertNever(error.type);
  }
}

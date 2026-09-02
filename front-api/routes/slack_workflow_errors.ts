import type { SlackWorkflowError } from "@app/lib/api/slack/summoning_whitelist";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function slackWorkflowErrorToApiError(
  error: SlackWorkflowError
): APIErrorWithContentfulStatusCode {
  switch (error.type) {
    case "slack_bot_not_connected":
      return {
        status_code: 400,
        api_error: {
          type: "connector_not_found_error",
          message: error.message,
        },
      };
    case "invalid_spaces":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      };
    case "not_found":
      return {
        status_code: 404,
        api_error: {
          type: "connector_update_error",
          message: error.message,
        },
      };
    case "connectors_error":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      };
    default:
      return assertNever(error.type);
  }
}

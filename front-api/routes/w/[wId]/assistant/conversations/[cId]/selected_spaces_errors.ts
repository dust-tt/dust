import type { SelectedConversationSpacesError } from "@app/lib/api/assistant/conversation/selected_spaces";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middlewares/utils";

export function apiErrorForSelectedSpaces(
  ctx: Parameters<typeof apiError>[0],
  error: SelectedConversationSpacesError
) {
  switch (error.code) {
    case "feature_flag_not_found":
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: error.message,
        },
      });
    case "conversation_not_mutable":
    case "space_not_selectable":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "conversation_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: error.message,
        },
      });
    case "space_not_found":
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: error.message,
        },
      });
    default:
      assertNever(error.code);
  }
}

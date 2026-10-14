import type { ModelSelectionError } from "@app/lib/api/assistant/conversation/model_selection";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middlewares/utils";

export { validatePublicModelSelection } from "@app/lib/api/assistant/conversation/model_selection";
export type { ModelSelectionError } from "@app/lib/api/assistant/conversation/model_selection";

export function apiErrorForModelSelection(
  ctx: Parameters<typeof apiError>[0],
  error: ModelSelectionError
) {
  switch (error.code) {
    case "invalid_model_selection":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "model_disabled":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "model_disabled",
          message: error.message,
        },
      });
    default:
      assertNever(error.code);
  }
}

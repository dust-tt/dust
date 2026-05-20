import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { ConversationError } from "@app/types/assistant/conversation";
import { apiError } from "@front-api/middleware/utils";
import type { Context } from "hono";

/**
 * Hono counterpart of `apiErrorForConversation` in
 * `front/lib/api/assistant/conversation/helper.ts`. Maps a conversation
 * error to its `APIErrorWithStatusCode` shape and dispatches via `apiError`.
 *
 * Known `ConversationError`s map to specific 4xx codes (see
 * `getConversationApiError`) and are sent without an underlying-error
 * attachment, since the error type is the signal. Anything else is mapped
 * to 500 and the original error is attached so its stack lands in the log.
 */
export function apiErrorForConversation(ctx: Context, error: Error) {
  const apiErr = getConversationApiError(error);
  if (error instanceof ConversationError) {
    return apiError(ctx, apiErr);
  }
  return apiError(ctx, apiErr, error);
}

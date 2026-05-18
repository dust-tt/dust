import { apiError } from "@app/logger/withlogging";
import type { ConversationErrorType } from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { APIErrorWithStatusCode } from "@app/types/error";
import { isOverflowingDBString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

const STATUS_FOR_ERROR_TYPE: Record<ConversationErrorType, number> = {
  conversation_access_restricted: 403,
  conversation_not_found: 404,
  conversation_with_unavailable_agent: 403,
  user_already_participant: 400,
  message_not_found: 404,
  message_deletion_not_authorized: 403,
  branch_not_found: 404,
  conversation_context_usage_not_found: 404,
};

/**
 * Maps a conversation error to the standard `{ status_code, api_error }`
 * shape. Use this from any framework (Next or Hono) — only the response
 * dispatch differs.
 */
export function getConversationApiError(error: Error): APIErrorWithStatusCode {
  if (error instanceof ConversationError) {
    return {
      status_code: STATUS_FOR_ERROR_TYPE[error.type],
      api_error: {
        type: error.type,
        message: error.message,
      },
    };
  }
  return {
    status_code: 500,
    api_error: {
      type: "internal_server_error",
      message: "An internal server error occurred.",
    },
  };
}

export function apiErrorForConversation(
  req: NextApiRequest,
  res: NextApiResponse,
  error: Error
) {
  const apiErr = getConversationApiError(error);
  if (error instanceof ConversationError) {
    return apiError(req, res, apiErr);
  }
  return apiError(req, res, apiErr, error);
}

export function isUserMessageContextOverflowing(context: {
  username?: string | null;
  timezone?: string | null;
  fullName?: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
}): boolean {
  if (
    isOverflowingDBString(context.username) ||
    isOverflowingDBString(context.timezone) ||
    isOverflowingDBString(context.fullName) ||
    isOverflowingDBString(context.email) ||
    isOverflowingDBString(context.profilePictureUrl, 2048)
  ) {
    return true;
  }
  return false;
}

import type { NextApiRequest, NextApiResponse } from "next";

import { apiError } from "@app/logger/withlogging";
import type { ConversationErrorType } from "@app/types";
import { ConversationError, isOverflowingDBString } from "@app/types";

const STATUS_FOR_ERROR_TYPE: Record<ConversationErrorType, number> = {
  conversation_access_restricted: 403,
  conversation_not_found: 404,
  conversation_with_unavailable_agent: 403,
  user_already_participant: 400,
};

export function apiErrorForConversation(
  req: NextApiRequest,
  res: NextApiResponse,
  error: Error
) {
  if (error instanceof ConversationError) {
    return apiError(req, res, {
      status_code: STATUS_FOR_ERROR_TYPE[error.type],
      api_error: {
        type: error.type,
        message: error.message,
      },
    });
  }

  return apiError(
    req,
    res,
    {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "An internal server error occurred.",
      },
    },
    error
  );
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

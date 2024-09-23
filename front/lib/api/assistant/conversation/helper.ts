import {
  ConversationNotFoundError,
  ConversationPermissionError,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiError } from "@app/logger/withlogging";

export function apiErrorForConversation(
  req: NextApiRequest,
  res: NextApiResponse,
  error: Error
) {
  if (error instanceof ConversationPermissionError) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "conversation_access_denied",
        message: "Access to the conversation is denied.",
      },
    });
  }

  if (error instanceof ConversationNotFoundError) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  return apiError(req, res, {
    status_code: 500,
    api_error: {
      type: "internal_server_error",
      message: "An internal server error occurred.",
    },
  });
}

import { ConversationError } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiError } from "@app/logger/withlogging";

export function apiErrorForConversation(
  req: NextApiRequest,
  res: NextApiResponse,
  error: Error
) {
  if (error instanceof ConversationError) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: error.type,
        message: error.message,
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

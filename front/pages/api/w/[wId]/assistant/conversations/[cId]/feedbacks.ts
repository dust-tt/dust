import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation/without_content";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ feedbacks: AgentMessageFeedbackType[] }>
  >,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes = await getConversationWithoutContent(
    auth,
    conversationId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "GET":
      const feedbacksRes = await getConversationFeedbacksForUser(
        auth,
        conversation
      );

      if (feedbacksRes.isErr()) {
        return apiErrorForConversation(req, res, feedbacksRes.error);
      }

      const feedbacks = feedbacksRes.value;

      res.status(200).json({ feedbacks });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

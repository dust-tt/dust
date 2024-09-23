import type {
  ConversationMessageReactions,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { getMessageReactions } from "@app/lib/api/assistant/reaction";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ reactions: ConversationMessageReactions }>
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
      const reactionsRes = await getMessageReactions(auth, conversation);

      if (reactionsRes.isErr()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "conversation_access_denied",
            message: "You do not have permission to access this conversation.",
          },
        });
      }

      const reactions = reactionsRes.value;

      res.status(200).json({ reactions });
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

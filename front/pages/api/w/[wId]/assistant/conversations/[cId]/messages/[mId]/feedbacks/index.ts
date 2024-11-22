import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import {
  createMessageFeedback,
  deleteMessageFeedback,
  updateMessageFeedbackContent,
} from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export const MessageFeedbackRequestBodySchema = t.type({
  thumbDirection: t.string,
  feedback: t.union([t.string, t.undefined]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      success: boolean;
    }>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

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

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }

  const messageId = req.query.mId;
  const bodyValidation = MessageFeedbackRequestBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  switch (req.method) {
    case "POST":
      const created = await createMessageFeedback(auth, {
        messageId,
        conversation,
        user,
        thumbDirection: bodyValidation.right
          .thumbDirection as AgentMessageFeedbackDirection,
      });

      if (created) {
        res.status(200).json({ success: true });
        return;
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });

    case "PATCH":
      const updated = await updateMessageFeedbackContent(auth, {
        messageId,
        conversation,
        user,
        content: bodyValidation.right.feedback || "",
      });

      if (updated) {
        res.status(200).json({ success: true });
        return;
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });

    case "DELETE":
      const deleted = await deleteMessageFeedback(auth, {
        messageId,
        conversation,
        user,
      });

      if (deleted) {
        res.status(200).json({ success: true });
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

import { answerUserQuestion } from "@app/lib/api/assistant/conversation/answer_user_question";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const AnswerQuestionSchema = z.object({
  actionId: z.string(),
  selectedOptions: z.array(z.number()).optional(),
  customResponse: z.string().optional(),
});

type AnswerQuestionResponse = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AnswerQuestionResponse>>,
  auth: Authenticator
): Promise<void> {
  const { cId, mId } = req.query;
  if (typeof cId !== "string" || typeof mId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation, message, or workspace not found.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const parseResult = AnswerQuestionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${parseResult.error.message}`,
      },
    });
  }

  const conversation = await ConversationResource.fetchById(auth, cId);

  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const { actionId, selectedOptions, customResponse } = parseResult.data;

  const result = await answerUserQuestion(auth, conversation, {
    actionId,
    messageId: mId,
    selectedOptions,
    customResponse,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "action_not_blocked":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "action_not_blocked",
            message: result.error.message,
          },
        });
      case "action_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: result.error.message,
          },
        });
      default:
        return apiError(
          req,
          res,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to answer question",
            },
          },
          result.error
        );
    }
  }

  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler);

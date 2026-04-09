import { UserQuestionAnswerSchema } from "@app/lib/actions/types";
import { registerUserAnswer } from "@app/lib/api/assistant/conversation/answer_user_question";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/answer-question:
 *   post:
 *     summary: Answer a user question in a conversation message
 *     description: Submits an answer to a question asked by an agent in a specific message
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *         description: Workspace ID
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: mId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actionId
 *               - answer
 *             properties:
 *               actionId:
 *                 type: string
 *                 description: ID of the action to answer
 *               answer:
 *                 type: object
 *                 required:
 *                   - selectedOptions
 *                 properties:
 *                   selectedOptions:
 *                     type: array
 *                     items:
 *                       type: integer
 *                     description: Indices of selected options
 *                   customResponse:
 *                     type: string
 *                     description: Optional free-text response
 *     responses:
 *       200:
 *         description: Answer submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request body or action not blocked
 *       403:
 *         description: User not authorized to answer this question
 *       404:
 *         description: Conversation, message, or action not found
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

const AnswerQuestionRequestSchema = z.object({
  actionId: z.string(),
  answer: UserQuestionAnswerSchema,
});

interface AnswerQuestionResponse {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AnswerQuestionResponse>>,
  auth: Authenticator
): Promise<void> {
  const { cId, mId } = req.query;
  if (!isString(cId) || !isString(mId)) {
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

  const parseResult = AnswerQuestionRequestSchema.safeParse(req.body);
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

  const { actionId, answer } = parseResult.data;

  const result = await registerUserAnswer(auth, conversation, {
    actionId,
    messageId: mId,
    answer,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "unauthorized":
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: result.error.message,
          },
        });
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

export default withPublicAPIAuthentication(handler);

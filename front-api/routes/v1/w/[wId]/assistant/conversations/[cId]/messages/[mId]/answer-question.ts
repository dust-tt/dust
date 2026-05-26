import { UserQuestionAnswerSchema } from "@app/lib/actions/types";
import { registerUserAnswer } from "@app/lib/api/assistant/conversation/answer_user_question";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const AnswerQuestionRequestSchema = z.object({
  actionId: z.string(),
  answer: UserQuestionAnswerSchema,
});

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

interface AnswerQuestionResponse {
  success: boolean;
}

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/answer-question.
const app = publicApiApp();

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
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", AnswerQuestionRequestSchema),
  async (ctx): HandlerResult<AnswerQuestionResponse> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const { actionId, answer } = ctx.req.valid("json");

    const result = await registerUserAnswer(auth, conversation, {
      actionId,
      messageId: mId,
      answer,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: result.error.message,
            },
          });
        case "action_not_blocked":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "action_not_blocked",
              message: result.error.message,
            },
          });
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "action_not_found",
              message: result.error.message,
            },
          });
        default:
          return apiError(
            ctx,
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

    return ctx.json({ success: true });
  }
);

export default app;

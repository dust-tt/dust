import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GetFeedbacksResponseType } from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/feedbacks.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/feedbacks:
 *   get:
 *     summary: Get feedbacks for a conversation
 *     description: |
 *       Retrieves all feedback entries for a specific conversation.
 *       Requires authentication and read:conversation scope.
 *     tags:
 *       - Feedbacks
 *     parameters:
 *       - name: wId
 *         in: path
 *         description: Workspace ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         description: Conversation ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of feedback entries for the conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedbacks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       messageId:
 *                         type: string
 *                         description: ID of the message that received feedback
 *                       agentMessageId:
 *                         type: number
 *                         description: ID of the agent message
 *                       userId:
 *                         type: number
 *                         description: ID of the user who gave feedback
 *                       thumbDirection:
 *                         type: string
 *                         enum: [up, down]
 *                         description: Direction of the thumb feedback
 *                       content:
 *                         type: string
 *                         nullable: true
 *                         description: Optional feedback content/comment
 *                       createdAt:
 *                         type: number
 *                         description: Timestamp when feedback was created
 *                       agentConfigurationId:
 *                         type: string
 *                         description: ID of the agent configuration
 *                       agentConfigurationVersion:
 *                         type: number
 *                         description: Version of the agent configuration
 *                       isConversationShared:
 *                         type: boolean
 *                         description: Whether the conversation was shared
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */
app.get("/", async (ctx): HandlerResult<GetFeedbacksResponseType> => {
  const auth = ctx.get("auth");
  const conversationId = ctx.req.param("cId") ?? "";

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(ctx, conversationRes.error);
  }

  const conversation = conversationRes.value;

  if (!auth.user()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "user_authentication_required",
        message: "You must be logged in as a user to access this resource.",
      },
    });
  }

  const feedbacksRes = await getConversationFeedbacksForUser(
    auth,
    conversation
  );

  if (feedbacksRes.isErr()) {
    return apiErrorForConversation(ctx, feedbacksRes.error);
  }

  const feedbacks = feedbacksRes.value.map((feedback) => ({
    messageId: feedback.messageId,
    agentMessageId: feedback.agentMessageId,
    userId: feedback.userId,
    thumbDirection: feedback.thumbDirection,
    content: feedback.content,
    createdAt: feedback.createdAt.getTime(),
    agentConfigurationId: feedback.agentConfigurationId,
    agentConfigurationVersion: feedback.agentConfigurationVersion,
    isConversationShared: feedback.isConversationShared,
  }));

  return ctx.json({ feedbacks });
});

export default app;

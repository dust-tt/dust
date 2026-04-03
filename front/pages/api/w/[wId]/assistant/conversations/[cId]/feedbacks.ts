/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/feedbacks:
 *   get:
 *     summary: Get conversation feedbacks
 *     description: Retrieve all feedbacks for a conversation submitted by the authenticated user.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved feedbacks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedbacks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PrivateFeedback'
 *       401:
 *         description: Unauthorized
 */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getConversationFeedbacksForUser } from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ feedbacks: AgentMessageFeedbackType[] }>
  >,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
): Promise<void> {
  switch (req.method) {
    case "GET":
      const feedbacksRes = await getConversationFeedbacksForUser(
        auth,
        conversation.toJSON()
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);

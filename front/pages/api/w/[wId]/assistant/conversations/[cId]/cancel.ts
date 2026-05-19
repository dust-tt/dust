// @migration-status: MIGRATED_TO_HONO
/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/cancel:
 *   post:
 *     summary: Cancel message generation
 *     description: Cancels the generation of messages in a conversation.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - messageIds
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [cancel, gracefully_stop, interrupt]
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { gracefullyStopAgentLoop } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { terminateMessageGeneration } from "@app/lib/api/cancel";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type PostMessageEventResponseBody = {
  success: true;
};

const PostMessageEventBodySchema = z.object({
  action: z.enum(["cancel", "gracefully_stop", "interrupt"]),
  messageIds: z.array(z.string()),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessageEventResponseBody>>,
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
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostMessageEventBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }
      const { action, messageIds } = bodyValidation.data;

      switch (action) {
        case "cancel":
        case "interrupt":
          await terminateMessageGeneration(auth, {
            messageIds,
            conversationId,
            action,
          });
          break;
        case "gracefully_stop":
          await gracefullyStopAgentLoop(auth, {
            messageIds,
            conversationId,
          });
          break;
        default:
          assertNever(action);
      }

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  isStreaming: true,
});

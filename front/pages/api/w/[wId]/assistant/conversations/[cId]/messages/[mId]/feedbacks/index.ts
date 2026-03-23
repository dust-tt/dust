/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/feedbacks:
 *   post:
 *     summary: Submit message feedback
 *     description: Create or update feedback (thumbs up/down) for a specific agent message.
 *     tags:
 *       - Private Messages
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
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
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
 *               - thumbDirection
 *             properties:
 *               thumbDirection:
 *                 type: string
 *                 enum: [up, down]
 *               feedbackContent:
 *                 type: string
 *                 nullable: true
 *               isConversationShared:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Successfully submitted feedback
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete message feedback
 *     description: Remove the authenticated user's feedback for a specific agent message.
 *     tags:
 *       - Private Messages
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
 *       - in: path
 *         name: mId
 *         required: true
 *         description: ID of the message
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully deleted feedback
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
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import {
  deleteMessageFeedback,
  upsertMessageFeedback,
} from "@app/lib/api/assistant/feedback";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { triggerAgentMessageFeedbackNotification } from "@app/lib/notifications/workflows/agent-message-feedback";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import { launchAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/client";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export const MessageFeedbackRequestBodySchema = t.type({
  thumbDirection: t.string,
  feedbackContent: t.union([t.string, t.undefined, t.null]),
  isConversationShared: t.union([t.boolean, t.undefined]),
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
  const conversationId = req.query.cId;

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversationResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const messageRes = await conversationResource.getMessageById(auth, messageId);

  if (messageRes.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message:
          "The message you're trying to give feedback to does not exist or is not accessible.",
      },
    });
  }

  const conversation = conversationResource.toJSON();

  switch (req.method) {
    case "POST":
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

      const created = await upsertMessageFeedback(auth, {
        messageId,
        conversation,
        user: user.toJSON(),
        thumbDirection: bodyValidation.right
          .thumbDirection as AgentMessageFeedbackDirection,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        content: bodyValidation.right.feedbackContent || "",
        isConversationShared: bodyValidation.right.isConversationShared,
      });

      if (created.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to upsert feedback",
          },
        });
      }

      await launchAgentMessageFeedbackWorkflow(auth, {
        message: {
          agentMessageId: messageId,
          conversationId: conversation.sId,
        },
      });

      await triggerAgentMessageFeedbackNotification(auth, {
        conversationId: conversation.sId,
        messageId,
        agentConfigurationId: created.value.agentConfigurationId,
        thumbDirection: bodyValidation.right
          .thumbDirection as AgentMessageFeedbackDirection,
        feedbackId: created.value.feedbackId,
      });

      res.status(200).json({ success: true });
      return;

    case "DELETE":
      const deleted = await deleteMessageFeedback(auth, {
        messageId,
        conversation,
        user: user.toJSON(),
      });

      if (deleted) {
        res.status(200).json({ success: true });
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The message you're trying to give feedback to does not exist.",
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

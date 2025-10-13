import type { PostMessageFeedbackResponseType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import {
  deleteMessageFeedback,
  upsertMessageFeedback,
} from "@app/lib/api/assistant/feedback";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getUserEmailFromHeaders } from "@app/types/user";

export const MessageFeedbackRequestBodySchema = t.type({
  thumbDirection: t.string,
  feedbackContent: t.union([t.string, t.undefined, t.null]),
  isConversationShared: t.union([t.boolean, t.undefined]),
});

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/feedbacks:
 *   post:
 *     summary: Submit feedback for a specific message in a conversation
 *     description: |
 *       Submit user feedback (thumbs up/down) for a specific message in a conversation.
 *       Requires authentication and update:conversation scope.
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
 *       - name: mId
 *         in: path
 *         description: Message ID
 *         required: true
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
 *                 description: Direction of the thumb feedback
 *               feedbackContent:
 *                 type: string
 *                 description: Optional feedback text content
 *               isConversationShared:
 *                 type: boolean
 *                 description: Whether the conversation is shared
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request parameters or body
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation or message not found
 *   delete:
 *     summary: Delete feedback for a specific message
 *     description: |
 *       Delete user feedback for a specific message in a conversation.
 *       Requires authentication and update:conversation scope.
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
 *       - name: mId
 *         in: path
 *         description: Message ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation, message or feedback not found
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessageFeedbackResponseType>>,
  auth: Authenticator
): Promise<void> {
  // Try to get user from auth, or from email header if using API key
  let userResource = auth.user();
  let user = userResource ? userResource.toJSON() : null;

  if (!user && auth.isKey()) {
    // Check if we have a user email header (used by Slack integration)
    const userEmail = getUserEmailFromHeaders(req.headers);
    if (userEmail) {
      // Find user by email
      const users = await UserResource.listByEmail(userEmail);
      if (users.length > 0) {
        // Get the first user (there might be multiple with same email)
        const workspace = auth.getNonNullableWorkspace();
        for (const u of users) {
          const memberships = await MembershipResource.getActiveMemberships({
            users: [u],
            workspace,
          });
          if (memberships.memberships.length > 0) {
            userResource = u;
            user = u.toJSON();
            break;
          }
        }
      }
    }
  }

  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message:
          "The user does not have an active session or is not authenticated.",
      },
    });
  }

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
        user,
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
      res.status(200).json({ success: true });
      return;

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

export default withPublicAPIAuthentication(handler, {
  requiredScopes: {
    POST: "update:conversation",
    DELETE: "update:conversation",
  },
});

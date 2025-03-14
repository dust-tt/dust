import type { PostMessagesResponseBody } from "@dust-tt/client";
import { PublicPostEditMessagesRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { editUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isUserMessageType } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/messages/{mId}/edit:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Edit an existing message in a conversation
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Workspace ID
 *       - name: cId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - name: mId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID to edit
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - mentions
 *             properties:
 *               content:
 *                 type: string
 *                 description: New content for the message
 *               mentions:
 *                 type: array
 *                 description: List of agent mentions in the message
 *                 items:
 *                   type: object
 *                   required:
 *                     - configurationId
 *                   properties:
 *                     configurationId:
 *                       type: string
 *                       description: ID of the mentioned agent configuration
 *     responses:
 *       200:
 *         description: Message successfully edited
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   description: The edited user message
 *                 agentMessages:
 *                   type: array
 *                   description: Optional array of agent messages generated in response
 *       400:
 *         description: Invalid request (message not found or not a user message)
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMessagesResponseBody>>,
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
  const conversationRes = await getConversation(auth, conversationId);

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
      const r = PublicPostEditMessagesRequestBodySchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const message = conversation.content
        .flat()
        .find((m) => m.sId === messageId);
      if (!message || !isUserMessageType(message)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The message you're trying to edit does not exist or is not an user message.",
          },
        });
      }
      const { content, mentions } = r.data;

      const editedMessageRes = await editUserMessageWithPubSub(auth, {
        conversation,
        message,
        content,
        mentions,
      });
      if (editedMessageRes.isErr()) {
        return apiError(req, res, editedMessageRes.error);
      }

      res.status(200).json({
        message: editedMessageRes.value.userMessage,
        // TODO(pr, attach-ds): remove this once type support for content node fragment is added in the public API.
        // Will be tackled by https://github.com/dust-tt/tasks/issues/2388.
        // @ts-expect-error cf above
        agentMessages: editedMessageRes.value.agentMessages ?? undefined,
      });
      return;

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

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "update:conversation" },
});

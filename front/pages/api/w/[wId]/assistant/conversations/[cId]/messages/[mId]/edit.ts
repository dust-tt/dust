/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/edit:
 *   post:
 *     summary: Edit a message
 *     description: Edit the content and mentions of an existing user message in a conversation.
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
 *               - content
 *               - mentions
 *             properties:
 *               content:
 *                 type: string
 *               mentions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PrivateMention'
 *     responses:
 *       200:
 *         description: Successfully edited message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/PrivateUserMessage'
 *       401:
 *         description: Unauthorized
 */
import { editUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { UserMessageType } from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const AgentMentionSchema = t.type({
  configurationId: t.string,
});
const UserMentionSchema = t.type({
  type: t.literal("user"),
  userId: t.string,
});

const PostEditRequestBodySchema = t.type({
  content: t.string,
  mentions: t.array(t.union([AgentMentionSchema, UserMentionSchema])),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ message: UserMessageType }>>,
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

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }
  const conversationId = req.query.cId;
  const messageId = req.query.mId;

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
          "The message you're trying to edit does not exist or is not accessible.",
      },
    });
  }

  const branchId = messageRes.value.branchSId ?? null;

  const conversationRes = await getConversation(
    auth,
    conversationId,
    false,
    branchId
  );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversation = conversationRes.value;

  switch (req.method) {
    case "POST":
      const bodyValidation = PostEditRequestBodySchema.decode(req.body);

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
      const { content, mentions } = bodyValidation.right;

      const editedMessageRes = await editUserMessage(auth, {
        conversation,
        message,
        content,
        mentions,
        // For now we never skip tools when interacting with agents from the web client.
        skipToolsValidation: false,
      });
      if (editedMessageRes.isErr()) {
        return apiError(req, res, editedMessageRes.error);
      }

      res.status(200).json({ message: editedMessageRes.value.userMessage });
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

export default withSessionAuthenticationForWorkspace(handler);

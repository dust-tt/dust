import { editUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { addBackwardCompatibleAgentMessageFields } from "@app/lib/api/v1/backward_compatibility";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isUserMessageType } from "@app/types/assistant/conversation";
import {
  type PostMessagesResponseBody,
  PublicPostEditMessagesRequestBodySchema,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/edit.
const app = publicApiApp();

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
app.post(
  "/",
  validate("json", PublicPostEditMessagesRequestBodySchema),
  async (ctx): HandlerResult<PostMessagesResponseBody> => {
    const auth = ctx.get("auth");
    const conversationId = ctx.req.param("cId") ?? "";
    const messageId = ctx.req.param("mId") ?? "";

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (!conversationResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const messageRes = await conversationResource.getMessageById(
      auth,
      messageId
    );

    if (messageRes.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message:
            "The message you're trying to edit does not exist or is not accessible.",
        },
      });
    }

    const branchId = messageRes.value.getBranchId() ?? null;

    const conversationRes = await getConversation(
      auth,
      conversationId,
      false,
      branchId
    );

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;

    const message = conversation.content
      .flat()
      .find((m) => m.sId === messageId);
    if (!message || !isUserMessageType(message)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The message you're trying to edit does not exist or is not an user message.",
        },
      });
    }
    const { content, mentions, skipToolsValidation } = ctx.req.valid("json");

    const editedMessageRes = await editUserMessage(auth, {
      conversation,
      message,
      content,
      mentions,
      skipToolsValidation,
    });
    if (editedMessageRes.isErr()) {
      return apiError(ctx, editedMessageRes.error);
    }

    return ctx.json({
      message: editedMessageRes.value.userMessage,
      agentMessages:
        editedMessageRes.value.agentMessages.map(
          addBackwardCompatibleAgentMessageFields
        ) ?? undefined,
    });
  }
);

export default app;

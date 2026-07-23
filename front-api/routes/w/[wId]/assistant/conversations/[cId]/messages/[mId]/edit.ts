import { editUserMessage } from "@app/lib/api/assistant/conversation";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const AgentMentionSchema = z.object({
  configurationId: z.string(),
});
const UserMentionSchema = z.object({
  type: z.literal("user"),
  userId: z.string(),
});

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const PostEditRequestBodySchema = z.object({
  content: z.string(),
  mentions: z.array(z.union([AgentMentionSchema, UserMentionSchema])),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/edit.
const app = workspaceApp();

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

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostEditRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { cId: conversationId, mId: messageId } = ctx.req.valid("param");

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

    const messageModel = messageRes.value;
    if (!messageModel.userMessage) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The message you're trying to edit does not exist or is not an user message.",
        },
      });
    }

    const branchId = messageModel.getBranchId() ?? null;

    const renderRes = await batchRenderMessages(
      auth,
      conversationResource,
      [messageModel],
      "full"
    );
    if (renderRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to render message.",
        },
      });
    }

    const message = renderRes.value[0];
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

    const { content, mentions } = ctx.req.valid("json");

    const editedMessageRes = await editUserMessage(auth, {
      conversationResource,
      branchId,
      message,
      content,
      mentions,
      // For now we never skip tools when interacting with agents from the web client.
      skipToolsValidation: false,
    });
    if (editedMessageRes.isErr()) {
      return apiError(ctx, editedMessageRes.error);
    }

    return ctx.json({ message: editedMessageRes.value.userMessage });
  }
);

export default app;

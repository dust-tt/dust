import {
  softDeleteAgentMessage,
  softDeleteUserMessageAndReplies,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  LightMessageType,
  MessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import actions from "./actions";
import answerQuestion from "./answer-question";
import edit from "./edit";
import events from "./events";
import feedbacks from "./feedbacks";
import mentions from "./mentions";
import rawContentFragment from "./raw_content_fragment";
import reactions from "./reactions";
import resolveAuthentication from "./resolve-authentication";
import resolveFileAuthorization from "./resolve-file-authorization";
import retry from "./retry";
import skills from "./skills";
import validateAction from "./validate-action";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

// Mounted under /api/w/:wId/assistant/conversations/:cId/messages/:mId.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}:
 *   get:
 *     summary: Get a message
 *     description: Retrieve a specific message by its ID within a conversation.
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
 *         description: Successfully retrieved message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/PrivateUserMessage'
 *                     - $ref: '#/components/schemas/PrivateAgentMessage'
 *                     - $ref: '#/components/schemas/PrivateContentFragment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message or conversation not found
 *   delete:
 *     summary: Delete a message
 *     description: Soft-delete a user or agent message from a conversation.
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
 *         description: Successfully deleted message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Message or conversation not found
 */

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, mId } = ctx.req.valid("param");

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const messageRes = await conversation.getMessageById(auth, mId);
  if (messageRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found.",
      },
    });
  }

  const viewType = ctx.req.query("viewType") === "light" ? "light" : "full";

  const renderedMessages = await batchRenderMessages(
    auth,
    conversation,
    [messageRes.value],
    viewType,
    null
  );

  if (renderedMessages.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Internal server error",
      },
    });
  }

  switch (viewType) {
    case "light":
      return ctx.json({
        message: renderedMessages.value[0] as LightMessageType,
      });
    case "full":
      return ctx.json({ message: renderedMessages.value[0] as MessageType });
    default:
      assertNever(viewType);
  }
});

app.delete("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, mId } = ctx.req.valid("param");

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const messageRes = await conversation.getMessageById(auth, mId);
  if (messageRes.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found.",
      },
    });
  }

  const message = messageRes.value;
  const branchId = message.getBranchId() ?? null;

  if (!message.userMessage && !message.agentMessage) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "The message you're trying to delete does not exist.",
      },
    });
  }

  const conversationRes = await getConversation(
    auth,
    conversation.sId,
    false,
    branchId
  );

  if (conversationRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Unable to get the conversation.",
      },
    });
  }

  const fullConversation = conversationRes.value;

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
    [message],
    "full"
  );
  if (renderRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Unable to render the message you're trying to delete.",
      },
    });
  }

  const renderedMessage = renderRes.value[0];

  if (isUserMessageType(renderedMessage)) {
    const deleteResult = await softDeleteUserMessageAndReplies(auth, {
      message: renderedMessage,
      conversation: fullConversation,
    });
    if (deleteResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: deleteResult.error.type,
          message: deleteResult.error.message,
        },
      });
    }
  } else if (isAgentMessageType(renderedMessage)) {
    const deleteResult = await softDeleteAgentMessage(auth, {
      message: renderedMessage,
      conversation: fullConversation,
    });
    if (deleteResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: deleteResult.error.type,
          message: deleteResult.error.message,
        },
      });
    }
  } else {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "The message you're trying to delete does not exist.",
      },
    });
  }

  return ctx.json({ success: true });
});

app.route("/actions", actions);
app.route("/answer-question", answerQuestion);
app.route("/edit", edit);
app.route("/events", events);
app.route("/feedbacks", feedbacks);
app.route("/mentions", mentions);
app.route("/raw_content_fragment", rawContentFragment);
app.route("/reactions", reactions);
app.route("/resolve-authentication", resolveAuthentication);
app.route("/resolve-file-authorization", resolveFileAuthorization);
app.route("/retry", retry);
app.route("/skills", skills);
app.route("/validate-action", validateAction);

export default app;

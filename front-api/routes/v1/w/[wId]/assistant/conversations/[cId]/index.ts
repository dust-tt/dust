import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { PatchConversationResponseBody } from "@app/lib/api/assistant/conversation/types";
import { addBackwardCompatibleConversationFields } from "@app/lib/api/v1/backward_compatibility";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  type GetConversationResponseType,
  PatchConversationRequestSchema,
} from "@dust-tt/client";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import actions from "./actions";
import cancel from "./cancel";
import contentFragments from "./content_fragments";
import events from "./events";
import feedbacks from "./feedbacks";
import files from "./files";
import mentions from "./mentions";
import messages from "./messages";
import tools from "./tools";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}:
 *   get:
 *     summary: Get a conversation
 *     description: Get a conversation in the workspace identified by {wId}. Supports optional pagination of message content via limit and lastValue query parameters.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
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
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of messages to return. When omitted, all messages are returned.
 *         schema:
 *           type: integer
 *       - in: query
 *         name: lastValue
 *         required: false
 *         description: Cursor value (message rank) from a previous response to fetch the next page of messages.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Conversation'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 *   patch:
 *     summary: Update conversation read status
 *     description: Mark a conversation as read or unread in the workspace identified by {wId}.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               read:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Conversation marked as read successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationResponseType> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    // Build optional message pagination from query params.
    // When omitted, all messages are returned (backward compatible).
    const limit = ctx.req.query("limit");
    const lastValue = ctx.req.query("lastValue");
    const messagePagination =
      typeof limit === "string"
        ? {
            limit: parseInt(limit, 10),
            lastRank:
              typeof lastValue === "string" ? parseInt(lastValue, 10) : null,
          }
        : undefined;

    const conversationRes = await getConversation(
      auth,
      cId,
      false,
      null,
      null,
      messagePagination
    );

    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const {
      hasMore,
      lastValue: paginationLastValue,
      ...conversation
    } = conversationRes.value;

    const response: GetConversationResponseType = {
      conversation: addBackwardCompatibleConversationFields(conversation),
    };

    if (hasMore !== undefined) {
      response.hasMore = hasMore;
      response.lastValue =
        paginationLastValue !== undefined && paginationLastValue !== null
          ? String(paginationLastValue)
          : null;
    }

    return ctx.json(response);
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchConversationRequestSchema),
  async (ctx): HandlerResult<PatchConversationResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getConversation(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const { read } = ctx.req.valid("json");
    if (read) {
      await ConversationResource.markAsReadForAuthUser(auth, {
        conversation: conversationRes.value,
      });
    } else {
      await ConversationResource.markAsUnreadForAuthUser(auth, {
        conversation: conversationRes.value,
      });
    }
    return ctx.json({ success: true });
  }
);

app.route("/actions", actions);
app.route("/cancel", cancel);
app.route("/content_fragments", contentFragments);
app.route("/events", events);
app.route("/feedbacks", feedbacks);
app.route("/files", files);
app.route("/mentions", mentions);
app.route("/messages", messages);
app.route("/tools", tools);

export default app;

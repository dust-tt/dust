import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { addBackwardCompatibleConversationFields } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { PatchConversationResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GetConversationResponseType } from "@dust-tt/client";
import { PatchConversationRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

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
 *       405:
 *         description: Method not supported. Only GET is expected.
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
 *       405:
 *         description: Method not supported. Only GET or PATCH is expected.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,

  res: NextApiResponse<
    WithAPIErrorResponse<
      GetConversationResponseType | PatchConversationResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { cId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Build optional message pagination from query params.
      // When omitted, all messages are returned (backward compatible).
      const { limit, lastValue } = req.query;
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
        return apiErrorForConversation(req, res, conversationRes.error);
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

      return res.status(200).json(response);
    }

    case "PATCH": {
      const conversationRes = await getConversation(auth, cId);
      if (conversationRes.isErr()) {
        return apiErrorForConversation(req, res, conversationRes.error);
      }

      const r = PatchConversationRequestSchema.safeParse(req.body);
      if (!r.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }
      const { read } = r.data;
      if (read) {
        await ConversationResource.markAsReadForAuthUser(auth, {
          conversation: conversationRes.value,
        });
      } else {
        await ConversationResource.markAsUnreadForAuthUser(auth, {
          conversation: conversationRes.value,
        });
      }
      return res.status(200).json({ success: true });
    }

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

export default withPublicAPIAuthentication(handler);

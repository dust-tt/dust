import {
  parseMentionSelectParam,
  suggestionsOfMentions,
} from "@app/lib/api/assistant/conversation/mention_suggestions";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  GetMentionSuggestionsRequestQuerySchema,
  type GetMentionSuggestionsResponseBodyType,
} from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/mentions/suggestions.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/mentions/suggestions:
 *   get:
 *     summary: Get mention suggestions for a conversation
 *     description: Get suggestions for mentions (agents and users) based on a query string, scoped to a specific conversation.
 *     tags:
 *       - Mentions
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
 *         name: query
 *         required: true
 *         description: Search query string to filter suggestions
 *         schema:
 *           type: string
 *       - in: query
 *         name: select
 *         required: false
 *         description: Array of mention types to include. Can be "agents", "users", or both. If not provided, defaults to agents and users.
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum:
 *               - agents
 *               - users
 *       - in: query
 *         name: current
 *         required: false
 *         description: Whether to include the current user in the suggestions.
 *         schema:
 *           type: boolean
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of mention suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RichMention'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
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
  validate("query", GetMentionSuggestionsRequestQuerySchema),
  async (ctx): HandlerResult<GetMentionSuggestionsResponseBodyType> => {
    const auth = ctx.get("auth");
    const { cId: conversationId } = ctx.req.valid("param");

    const conversationRes = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversationRes) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found",
        },
      });
    }

    const { query, select: selectParam, current } = ctx.req.valid("query");

    const suggestions = await suggestionsOfMentions(auth, {
      query,
      select: parseMentionSelectParam(selectParam),
      current,
    });

    return ctx.json({ suggestions });
  }
);

export default app;

import { getConversationConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/conversation_read";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

/**
 * @cc [owner:aubin-tchoi,label:security;api] consumption-requires-conversation-access
 * This endpoint MUST return 404 for a conversation the caller cannot read, including deleted
 * conversations, and MUST NOT elevate the caller's authenticator to read consumption details.
 */
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/consumption:
 *   get:
 *     summary: Get conversation consumption
 *     description: |
 *       Get the same credit breakdown as the conversation consumption view for a conversation
 *       the caller can read. Returns stable billed credits for terminal agent messages, including
 *       superseded message versions and accessible recursively spawned run-agent conversations.
 *       In-progress messages are excluded until they reach a terminal state.
 *
 *       Details use each billed message's newest complete stored attribution. They are null when
 *       no messages have positive billed credits or any billed message lacks complete attribution.
 *       Agent work and tool attributions partition the bill. Models and agents are alternative
 *       groupings of that bill, not additional charges. This endpoint does not return token counts
 *       or a cached-versus-uncached input breakdown.
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
 *     responses:
 *       200:
 *         description: Conversation consumption retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConversationConsumption'
 *       400:
 *         description: Invalid request parameters.
 *       401:
 *         description: Invalid or missing authentication credentials.
 *       403:
 *         description: The workspace plan does not allow API access.
 *       404:
 *         description: Workspace or conversation not found, deleted, or not accessible to the caller.
 *       500:
 *         description: Internal server error.
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<ConversationConsumptionResponse> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "Conversation not found.",
        },
      });
    }

    const consumption = await getConversationConsumption(auth, {
      conversation,
    });

    return ctx.json(consumption);
  }
);

export default app;

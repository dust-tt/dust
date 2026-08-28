import { getConversationConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/conversation_read";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationConsumptionResponse } from "@app/types/assistant/conversation_consumption";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/consumption:
 *   get:
 *     summary: Get a conversation credit attribution
 *     description: Returns the latest stable credits billed for completed messages belonging directly to a conversation, plus an additive attribution reconciled exclusively through model input rows. In-progress messages are included after they reach a terminal state.
 *     tags:
 *       - Private Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Conversation credit attribution
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - billedCredits
 *                 - details
 *               properties:
 *                 billedCredits:
 *                   type: number
 *                   description: Latest stable credits billed across completed messages belonging directly to the conversation.
 *                 details:
 *                   type: object
 *                   allOf:
 *                     - $ref: '#/components/schemas/PrivateConversationConsumptionDetails'
 *                   nullable: true
 *       404:
 *         description: Conversation not found
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

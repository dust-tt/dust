import { getAgentMessageConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/read";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const app = workspaceApp();

app.use(withFeatureFlag("conversation_consumption_details"));

/**
 * @swagger
 * /api/w/{wId}/assistant/conversations/{cId}/messages/{mId}/consumption:
 *   get:
 *     summary: Get an agent message credit attribution
 *     description: Returns billed credits and an additive attribution for the message and its direct sub-agents, reconciled exclusively through model input rows.
 *     tags:
 *       - Private Messages
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
 *       - in: path
 *         name: mId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Credit attribution for the agent message
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
 *                   nullable: true
 *                   description: Authoritative credits billed directly for this agent message, excluding sub-agents.
 *                 subAgentBilledCredits:
 *                   type: number
 *                   description: Credits billed by direct sub-agents spawned from this message.
 *                 totalBilledCredits:
 *                   type: number
 *                   description: Total credits billed by this message and its direct sub-agents.
 *                 details:
 *                   type: object
 *                   nullable: true
 *                   description: Additive attribution of the message and its direct sub-agents, reconciled to totalBilledCredits through model input rows. Null when any billed message lacks a complete stored attribution.
 *                   required:
 *                     - attributionVersion
 *                     - agentWorkCredits
 *                     - tools
 *                   properties:
 *                     attributionVersion:
 *                       type: integer
 *                       description: Oldest attribution version contributing to the expanded aggregate.
 *                     agentWorkCredits:
 *                       type: number
 *                       description: Agent work across the message and its direct sub-agents after assigning billing reconciliation exclusively to model input rows.
 *                     tools:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - label
 *                           - internalMCPServerName
 *                           - toolName
 *                           - callCount
 *                           - attributedCredits
 *                           - directCredits
 *                           - pending
 *                         properties:
 *                           label:
 *                             type: string
 *                           internalMCPServerName:
 *                             type: string
 *                             nullable: true
 *                           toolName:
 *                             type: string
 *                           callCount:
 *                             type: integer
 *                           attributedCredits:
 *                             type: number
 *                             description: Share of billed credits after input-only reconciliation.
 *                           directCredits:
 *                             type: number
 *                           pending:
 *                             type: boolean
 *       403:
 *         description: The workspace does not have access to consumption details
 *       404:
 *         description: Conversation or agent message not found
 */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<AgentMessageConsumptionResponse> => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

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

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: mId,
    });
    if (!consumption) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "message_not_found",
          message: "Agent message not found.",
        },
      });
    }

    return ctx.json(consumption);
  }
);

export default app;

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
 *     description: Returns direct and total billed credits. User-visible run-agent tool rows combine invocation cost with the bill of their sub-agent subtree; hidden helper agents are included in the parent agent's work.
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
 *                 totalBilledCredits:
 *                   type: number
 *                   description: Total credits billed by this message and its recursively spawned sub-agents.
 *                 details:
 *                   type: object
 *                   nullable: true
 *                   description: Additive attribution reconciled to totalBilledCredits through model input rows. User-visible run-agent tool rows include their sub-agent subtree's bill; hidden helper agents are included in agentWorkCredits. Null when no stored version is complete.
 *                   required:
 *                     - attributionVersion
 *                     - agentWorkCredits
 *                     - tools
 *                   properties:
 *                     attributionVersion:
 *                       type: integer
 *                       description: Attribution version used for this breakdown.
 *                     agentWorkCredits:
 *                       type: number
 *                       description: Work attributed to the originating agent, including hidden helper agents, after assigning billing reconciliation exclusively to model input rows.
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
 *                             description: Share of total billed credits after input-only reconciliation. User-visible run-agent tools include their sub-agent subtree's bill.
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

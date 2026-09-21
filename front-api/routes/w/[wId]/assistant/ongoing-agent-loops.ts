import { listOngoingAgentLoops } from "@app/lib/api/assistant/ongoing_agent_loops";
import type { GetOngoingAgentLoopsResponseBody } from "@app/types/api/assistant/conversation/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/assistant/ongoing-agent-loops:
 *   get:
 *     summary: List the authenticated user's ongoing agent loops
 *     description: Returns agent loops registered for the authenticated user in this workspace.
 *     tags:
 *       - Private Assistant
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Ongoing agent loops retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [agentLoops]
 *               properties:
 *                 agentLoops:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [conversationId, messageId]
 *                     properties:
 *                       conversationId:
 *                         type: string
 *                       messageId:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
app.get("/", async (ctx): HandlerResult<GetOngoingAgentLoopsResponseBody> => {
  const auth = ctx.get("auth");
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();
  const agentLoops = user
    ? await listOngoingAgentLoops({
        workspaceId: workspace.sId,
        userId: user.sId,
      })
    : [];

  return ctx.json({ agentLoops });
});

export default app;

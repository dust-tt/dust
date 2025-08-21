import type { PendingValidationsResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/pending-validations:
 *   get:
 *     summary: List pending action validations for a conversation
 *     description: |
 *       Returns the list of pending action validation requests for the specified conversation.
 *       Each item represents a tool execution awaiting user approval.
 *     tags:
 *       - Conversations
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Workspace ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: cId
 *         required: true
 *         description: Conversation ID
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending validations for the conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pendingValidations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Pending validation request
 *                     properties:
 *                       messageId:
 *                         type: string
 *                         description: ID of the related message
 *                       conversationId:
 *                         type: string
 *                         description: ID of the conversation
 *                       actionId:
 *                         type: string
 *                         description: ID of the pending action
 *                       inputs:
 *                         type: object
 *                         description: Tool input parameters awaiting approval
 *                       stake:
 *                         type: string
 *                         nullable: true
 *                         description: Importance/stake level of the tool action
 *                         enum: [high, low, never_ask]
 *                       metadata:
 *                         type: object
 *                         description: Additional metadata about the tool/server/agent
 *                         properties:
 *                           toolName:
 *                             type: string
 *                           mcpServerName:
 *                             type: string
 *                           agentName:
 *                             type: string
 *                           icon:
 *                             type: object
 *                             nullable: true
 *                             description: Optional icon descriptor for the tool/server
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Conversation not found
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal server error
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PendingValidationsResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method is not supported.",
      },
    });
  }

  const { cId } = req.query;

  if (!cId || !isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The conversation ID is required.",
      },
    });
  }

  const pendingValidations =
    await AgentMCPActionResource.listPendingValidationsForConversation(
      auth,
      cId
    );

  res.status(200).json({ pendingValidations });
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:conversation" },
});

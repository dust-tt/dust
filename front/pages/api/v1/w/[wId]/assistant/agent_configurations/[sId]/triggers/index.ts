import type { GetTriggersResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { toPublicTriggers } from "@app/lib/api/public_api/triggers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{sId}/triggers:
 *   get:
 *     summary: List triggers for an agent
 *     description: Get all triggers configured for the agent identified by {sId} in the workspace identified by {wId}.
 *     tags:
 *       - Triggers
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: sId
 *         required: true
 *         description: ID of the agent configuration
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of triggers for the agent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 triggers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       agentConfigurationSId:
 *                         type: string
 *                       kind:
 *                         type: string
 *                         enum: [schedule, webhook]
 *                       status:
 *                         type: string
 *                         enum: [enabled, disabled, relocating, downgraded]
 *                       configuration:
 *                         type: object
 *                       createdAt:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent configuration not found
 *       405:
 *         description: Method not supported
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggersResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { sId } = req.query;

  if (typeof sId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // Verify the agent configuration exists and user has access
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: sId,
    variant: "light",
  });

  if (!agentConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const triggers = await TriggerResource.listByAgentConfigurationId(
        auth,
        sId
      );

      const publicTriggers = await toPublicTriggers(auth, triggers);

      return res.status(200).json({
        triggers: publicTriggers,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, only GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);

import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { searchAgentConfigurationsByName } from "@app/lib/api/assistant/configuration";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/search:
 *   get:
 *     summary: Search assistants by name
 *     description: Search for agent configurations by name in the workspace identified by {wId}.
 *     tags:
 *       - Assistants
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Id of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         description: Search query for agent configuration names
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved agent configurations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfigurations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AgentConfiguration'
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationsResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const { q } = req.query;
      if (typeof q !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Search query parameter q is missing",
          },
        });
      }

      const agentConfigurations = await searchAgentConfigurationsByName(
        auth,
        q
      );
      return res.status(200).json({
        agentConfigurations,
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

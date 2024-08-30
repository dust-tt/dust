import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { searchAgentConfigurationsByName } from "@app/lib/api/assistant/configuration";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import type { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { apiError, withLogging } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{name}:
 *   get:
 *     summary: Search agent configuration by name
 *     description: Search for agent configurations by name in the workspace identified by {wId}.
 *     tags:
 *       - Assistant
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         description: Name of the agent configuration
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved agent configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/AgentConfiguration'
 *       400:
 *         description: Bad Request. The Assistant API is only available on your own workspace.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */

type GetAgentConfigurationsResponseBody = {
  agentConfigurations: AgentConfiguration[] | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentConfigurationsResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace ID not found",
      },
    });
  }

  const { workspaceAuth } = await Authenticator.fromKey(keyRes.value, wId);

  const owner = workspaceAuth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const wId = workspaceAuth.workspace()?.id;

      if (!wId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace ID not found",
          },
        });
      }

      if (typeof req.query.name !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Name of the agent configuration not found",
          },
        });
      }

      const agentConfigurations = await searchAgentConfigurationsByName(
        workspaceAuth,
        req.query.name
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

export default withLogging(handler);

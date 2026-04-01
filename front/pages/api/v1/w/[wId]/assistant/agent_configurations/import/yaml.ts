import { importAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ImportAgentConfigurationFromYAMLResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/import/yaml:
 *   post:
 *     summary: Import agent configuration from YAML
 *     description: Create a new agent configuration from a JSON body matching the agent YAML config schema.
 *     tags:
 *       - Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent
 *               - instructions
 *               - generation_settings
 *               - tags
 *               - editors
 *               - toolset
 *             properties:
 *               agent:
 *                 type: object
 *                 required:
 *                   - handle
 *                   - description
 *                   - scope
 *                   - max_steps_per_run
 *                   - visualization_enabled
 *                 properties:
 *                   handle:
 *                     type: string
 *                   description:
 *                     type: string
 *                   scope:
 *                     type: string
 *                     enum: [visible, hidden]
 *                   avatar_url:
 *                     type: string
 *                   max_steps_per_run:
 *                     type: number
 *                   visualization_enabled:
 *                     type: boolean
 *               instructions:
 *                 type: string
 *               generation_settings:
 *                 type: object
 *                 properties:
 *                   model_id:
 *                     type: string
 *                   provider_id:
 *                     type: string
 *                   temperature:
 *                     type: number
 *                   reasoning_effort:
 *                     type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     kind:
 *                       type: string
 *                       enum: [standard, protected]
 *               editors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     full_name:
 *                       type: string
 *               toolset:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [MCP]
 *                     configuration:
 *                       type: object
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully created agent configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/AgentConfiguration'
 *                 skippedActions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       reason:
 *                         type: string
 *       400:
 *         description: Bad Request. Invalid request body.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       405:
 *         description: Method not supported. Only POST is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<ImportAgentConfigurationFromYAMLResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const result = await importAgentConfigurationFromJSON(auth, req.body);

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  const { agentConfiguration, skippedActions } = result.value;

  return res.status(200).json({
    agentConfiguration,
    skippedActions: skippedActions.length > 0 ? skippedActions : undefined,
  });
}

export default withPublicAPIAuthentication(handler);

import { patchAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { PatchAgentConfigurationFromYAMLResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{sId}/import:
 *   patch:
 *     summary: Patch agent configuration
 *     description: |
 *       Partially update an existing agent configuration. Accepts the same JSON
 *       schema as the import endpoint but all fields are optional. Provided
 *       top-level arrays (tags, editors, toolset, skills, spaces) replace the
 *       existing values; omitted fields are left unchanged. Nested objects
 *       (agent, generation_settings) are shallow-merged.
 *     tags:
 *       - Agents
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agent:
 *                 type: object
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
 *         description: Successfully patched agent configuration
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
 *       404:
 *         description: Agent configuration not found.
 *       405:
 *         description: Method not supported. Only PATCH is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchAgentConfigurationFromYAMLResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "PATCH") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, PATCH is expected.",
      },
    });
  }

  const { sId } = req.query;
  if (!isString(sId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const result = await patchAgentConfigurationFromJSON(auth, sId, req.body);

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  const { agentConfiguration, skippedActions } = result.value;

  return res.status(200).json({
    agentConfiguration,
    skippedActions,
  });
}

export default withPublicAPIAuthentication(handler);

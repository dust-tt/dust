import { importAgentConfigurationFromYAML } from "@app/lib/api/assistant/configuration/yaml_import";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ImportAgentConfigurationFromYAMLResponseType } from "@dust-tt/client";
import { ImportAgentConfigurationFromYAMLRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/import/yaml:
 *   post:
 *     summary: Import agent configuration from YAML
 *     description: Create a new agent configuration from a YAML definition.
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
 *               - yamlContent
 *             properties:
 *               yamlContent:
 *                 type: string
 *                 description: The YAML content defining the agent configuration
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully created agent configuration from YAML
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
 *         description: Bad Request. Invalid YAML or request body.
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

  const bodyValidation =
    ImportAgentConfigurationFromYAMLRequestSchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).message}`,
      },
    });
  }

  const result = await importAgentConfigurationFromYAML(
    auth,
    bodyValidation.data.yamlContent
  );

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

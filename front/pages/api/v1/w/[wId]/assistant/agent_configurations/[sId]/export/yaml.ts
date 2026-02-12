import type { GetAgentConfigurationYAMLExportResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { exportAgentConfigurationAsYAML } from "@app/lib/api/assistant/configuration/yaml_export";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{sId}/export/yaml:
 *   get:
 *     summary: Export agent configuration as YAML
 *     description: Download the agent configuration identified by {sId} as a YAML file.
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
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The agent configuration as a downloadable YAML file
 *         content:
 *           text/yaml:
 *             schema:
 *               type: string
 *         headers:
 *           Content-Disposition:
 *             description: Attachment with suggested filename
 *             schema:
 *               type: string
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       405:
 *         description: Method not supported. Only GET is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationYAMLExportResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
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

  const result = await exportAgentConfigurationAsYAML(auth, sId);

  if (result.isErr()) {
    return apiError(req, res, result.error);
  }

  const { yamlContent, filename } = result.value;

  res.setHeader("Content-Type", "text/yaml; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).end(yamlContent);
}

export default withPublicAPIAuthentication(handler);

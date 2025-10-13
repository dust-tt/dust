import type { GetOrPatchAgentConfigurationResponseType } from "@dust-tt/client";
import { PatchAgentConfigurationRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/{sId}:
 *   get:
 *     summary: Get agent configuration
 *     description: Retrieve the agent configuration identified by {sId} in the workspace identified by {wId}.
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
 *       - in: query
 *         name: variant
 *         required: false
 *         description: Configuration variant to retrieve. 'light' returns basic config without actions, 'full' includes complete actions/tools configuration
 *         schema:
 *           type: string
 *           enum: [light, full]
 *           default: light
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
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       405:
 *         description: Method not supported. Only GET or PATCH is expected.
 *       500:
 *         description: Internal Server Error.
 *   patch:
 *     summary: Update agent configuration
 *     description: Update the agent configuration identified by {sId} in the workspace identified by {wId}.
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
 *               userFavorite:
 *                  type: boolean
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully updated agent configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/AgentConfiguration'
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       405:
 *         description: Method not supported. Only GET or PATCH is expected.
 *       500:
 *         description: Internal Server Error.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetOrPatchAgentConfigurationResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  const { sId, variant } = req.query;

  if (typeof sId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // Validate variant parameter if provided
  const configVariant =
    typeof variant === "string" && (variant === "light" || variant === "full")
      ? variant
      : "light";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: sId,
    variant: configVariant,
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
      return res.status(200).json({
        agentConfiguration,
      });
    }
    case "PATCH": {
      const r = PatchAgentConfigurationRequestSchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      if (r.data.userFavorite !== undefined) {
        const updateRes = await setAgentUserFavorite({
          auth,
          agentId: sId,
          userFavorite: r.data.userFavorite,
        });

        if (updateRes.isOk()) {
          agentConfiguration.userFavorite = r.data.userFavorite;
        } else {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: updateRes.error.message,
            },
          });
        }
      }

      return res.status(200).json({
        agentConfiguration,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, only GET or PATCH is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);

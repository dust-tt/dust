// @migration-status: MIGRATED_TO_HONO
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { normalizeAgentView } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const GetAgentConfigurationsQuerySchema = z.object({
  view: z
    .enum(["all", "list", "workspace", "published", "global", "favorites"])
    .optional(),
  withAuthors: z.enum(["true", "false"]).optional(),
});

const viewRequiresUser = (view?: string): boolean =>
  view === "list" || view === "favorites";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations:
 *   get:
 *     summary: List agents
 *     description: Get the agent configurations for the workspace identified by {wId}.
 *     tags:
 *       - Agents
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: view
 *         required: false
 *         description: |
 *           The view to use when retrieving agents:
 *           - all: Retrieves all non-private agents (default if not authenticated)
 *           - list: Retrieves all active agents accessible to the user (default if authenticated)
 *           - published: Retrieves all agents with published scope
 *           - global: Retrieves all global agents
 *           - favorites: Retrieves all agents marked as favorites by the user (only available to authenticated users)
 *         schema:
 *           type: string
 *           enum: [all, list, workspace, published, global, favorites]
 *       - in: query
 *         name: withAuthors
 *         required: false
 *         description: When set to 'true', includes recent authors information for each agent
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Agent configurations for the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfigurations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AgentConfiguration'
 *                   description: Array of agent configurations, optionally including lastAuthors if withAuthors=true
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token, or attempting to access restricted views without authentication.
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
      const queryValidation = GetAgentConfigurationsQuerySchema.safeParse(
        req.query
      );

      if (!queryValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
          },
        });
      }

      if (viewRequiresUser(queryValidation.data.view) && !auth.user()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: `The user must be authenticated with oAuth to retrieve ${queryValidation.data.view} agents.`,
          },
        });
      }

      const defaultAgentGetView = auth.user() ? "list" : "all";
      const agentsGetView = queryValidation.data.view ?? defaultAgentGetView;
      const withAuthors = queryValidation.data.withAuthors === "true";

      let agentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView: normalizeAgentView(agentsGetView),
        variant: "light",
      });

      if (withAuthors) {
        const recentAuthors = await getAgentsRecentAuthors({
          auth,
          agents: agentConfigurations,
        });
        agentConfigurations = agentConfigurations.map(
          (agentConfiguration, index) => {
            return {
              ...agentConfiguration,
              lastAuthors: recentAuthors[index],
            };
          }
        );
      }

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

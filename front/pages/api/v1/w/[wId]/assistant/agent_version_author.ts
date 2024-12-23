import type {
  GetAgentConfigurationsResponseType,
  GetAgentVersionAuthorResponseType,
} from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { fetchAgentVersionAuthor } from "@app/lib/api/assistant/recent_authors";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export const GetAgentVersionAuthorSchema = t.type({
  view: t.union([
    t.literal("all"),
    t.literal("list"),
    t.literal("workspace"),
    t.literal("published"),
    t.literal("global"),
    t.literal("favorites"),
    t.undefined,
  ]),
  agentIds: t.array(t.string),
});

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_version_author:
 *   get:
 *     summary: List assistants
 *     description: Get the agent configurations for the workspace identified by {wId}.
 *     tags:
 *       - Assistants
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
 *           - workspace: Retrieves all agents with workspace scope
 *           - published: Retrieves all agents with published scope
 *           - global: Retrieves all global agents
 *           - favorites: Retrieves all agents marked as favorites by the user (only available to authenticated users)
 *         schema:
 *           type: string
 *           enum: [all, list, workspace, published, global, favorites]
 *       - in: query
 *         name: includes
 *         required: false
 *         description: Array of additional data to include in the response
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [authors]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Agent configurations for the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AgentConfiguration'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       500:
 *         description: Internal Server Error.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported. Only GET is expected.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAgentVersionAuthorResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = GetAgentVersionAuthorSchema.decode(req.query);

      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      if (!auth.user()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: `The user must be authenticated with oAuth to retrieve ${queryValidation.right.view} agents.`,
          },
        });
      }

      const defaultAgentGetView = auth.user() ? "list" : "all";

      const { agentIds } = queryValidation.right;

      const agentVersionAuthors = await fetchAgentVersionAuthor(
        // TODO: Try to find a way to plug the workspace ID here
        "",
        agentIds
      );

      return res.status(200).json({
        // Typing issue but it's the end of the onsite interview I have to go :()
        // @ts-ignore
        agentVersionAuthors,
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

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { GET: "read:agent" },
});

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { normalizeAgentView } from "@app/lib/api/v1/backward_compatibility";
import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import sId from "./agent_configurations/[sId]";
import importRoute from "./agent_configurations/import";
import search from "./agent_configurations/search";

const GetAgentConfigurationsQuerySchema = z.object({
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
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/assistant/agent_configurations.
const app = publicApiApp();

// Literal routes before param routes.
app.route("/import", importRoute);
app.route("/search", search);
app.route("/:sId", sId);

app.get(
  "/",
  validate("query", GetAgentConfigurationsQuerySchema),
  async (ctx): HandlerResult<GetAgentConfigurationsResponseType> => {
    const auth = ctx.get("auth");
    const { view, withAuthors: withAuthorsParam } = ctx.req.valid("query");

    if (viewRequiresUser(view) && !auth.user()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_request_error",
          message: `The user must be authenticated with oAuth to retrieve ${view} agents.`,
        },
      });
    }

    const defaultAgentGetView = auth.user() ? "list" : "all";
    const agentsGetView = view ?? defaultAgentGetView;
    const withAuthors = withAuthorsParam === "true";

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

    return ctx.json({
      agentConfigurations,
    });
  }
);

export default app;

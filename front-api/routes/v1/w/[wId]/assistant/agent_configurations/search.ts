import { listAgentsForView } from "@app/lib/api/assistant/agent_views";
import {
  addBackwardCompatibleAgentConfigurationFields,
  addLegacyLightAgentConfigurationFields,
} from "@app/lib/api/v1/backward_compatibility";
import { toAgentConfigurationsWithSkills } from "@app/lib/resources/agent_resource_serialization";
import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SearchQuerySchema = z.object({
  q: z.string(),
});

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/search:
 *   get:
 *     summary: Search agents by name
 *     description: Search for agent configurations by name in the workspace identified by {wId}.
 *       Returns the global agents and the published agents the caller can access whose name
 *       contains the query, case-insensitively.
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
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/assistant/agent_configurations/search.
/**
 * @cc [owner:avervaet,label:security;product] search-matches-all-view
 * The search MUST return exactly the agents of the `all` view whose name contains `q`,
 * case-insensitively: global agents included, and no agent the caller cannot `read`.
 */
const app = publicApiApp();

app.get(
  "/",
  validate("query", SearchQuerySchema),
  async (ctx): HandlerResult<GetAgentConfigurationsResponseType> => {
    const auth = ctx.get("auth");
    const { q } = ctx.req.valid("query");

    const lowerCaseQuery = q.toLowerCase();
    const agents = (await listAgentsForView(auth, "all")).filter((agent) =>
      agent.name.toLowerCase().includes(lowerCaseQuery)
    );
    const serialized = await toAgentConfigurationsWithSkills(auth, agents);

    return ctx.json({
      agentConfigurations: serialized.map((agentConfiguration) =>
        addBackwardCompatibleAgentConfigurationFields(
          addLegacyLightAgentConfigurationFields(agentConfiguration)
        )
      ),
    });
  }
);

export default app;

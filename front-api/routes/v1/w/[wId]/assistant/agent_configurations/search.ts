import { searchAgents } from "@app/lib/api/agents/search";
import { toAgentConfigurationsWithSkills } from "@app/lib/api/assistant/configuration/helpers";
import { addBackwardCompatibleAgentConfigurationFields } from "@app/lib/api/v1/backward_compatibility";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toLightAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import logger from "@app/logger/logger";
import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
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
const app = publicApiApp();

app.get(
  "/",
  validate("query", SearchQuerySchema),
  async (ctx): HandlerResult<GetAgentConfigurationsResponseType> => {
    const auth = ctx.get("auth");
    const { q } = ctx.req.valid("query");

    // Published agents only, like the former name search, matched by the agent search index.
    const searchResult = await searchAgents(auth, {
      searchTerm: q,
      filters: { scope: ["visible"] },
    });
    if (searchResult.isErr()) {
      logger.error(
        {
          error: searchResult.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Failed to search agents"
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to search agents",
        },
      });
    }

    const agentConfigurations = await toLightAgentConfigurations(
      auth,
      await AgentResource.fetchByIds(
        auth,
        searchResult.value.agents.map((agent) => agent.sId)
      )
    );
    const serialized = await toAgentConfigurationsWithSkills(
      auth,
      agentConfigurations
    );

    return ctx.json({
      agentConfigurations: serialized.map((agentConfiguration) =>
        addBackwardCompatibleAgentConfigurationFields(agentConfiguration)
      ),
    });
  }
);

export default app;

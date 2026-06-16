import { searchAgentConfigurationsByName } from "@app/lib/api/assistant/configuration/agent";
import { addBackwardCompatibleAgentConfigurationFields } from "@app/lib/api/v1/backward_compatibility";
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

    const agentConfigurations = await searchAgentConfigurationsByName(auth, q);
    return ctx.json({
      agentConfigurations: agentConfigurations.map((agentConfiguration) =>
        addBackwardCompatibleAgentConfigurationFields(agentConfiguration)
      ),
    });
  }
);

export default app;

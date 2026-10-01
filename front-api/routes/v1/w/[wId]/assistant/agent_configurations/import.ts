import { importAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurationsWithSkills } from "@app/lib/resources/agent_resource_serialization";
import type { ImportAgentConfigurationFromYAMLResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/import:
 *   post:
 *     summary: Import agent configuration
 *     description: Create a new agent configuration from a JSON body matching the agent config schema.
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
 *               - agent
 *               - instructions
 *               - generation_settings
 *               - tags
 *               - editors
 *               - toolset
 *             properties:
 *               agent:
 *                 type: object
 *                 required:
 *                   - handle
 *                   - description
 *                   - scope
 *                   - avatar_url
 *                   - max_steps_per_run
 *                   - visualization_enabled
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
 *                 description: Emails of the workspace members to set as editors of the agent.
 *                 items:
 *                   type: string
 *                   format: email
 *                 example: ["alice@example.com"]
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
 *         description: Successfully created agent configuration
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
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/assistant/agent_configurations/import.
const app = publicApiApp();

app.post(
  "/",
  async (ctx): HandlerResult<ImportAgentConfigurationFromYAMLResponseType> => {
    const auth = ctx.get("auth");

    const body = await ctx.req.json();
    const result = await importAgentConfigurationFromJSON(auth, body);

    if (result.isErr()) {
      return apiError(ctx, result.error);
    }

    const { agentConfiguration, skippedActions } = result.value;
    // Serialize the imported agent from a resource built for the caller, as the patch route does.
    const imported = await AgentResource.fetchById(
      auth,
      agentConfiguration.sId
    );
    if (!imported) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The imported agent configuration was not found.",
        },
      });
    }
    const [serialized] = await toAgentConfigurationsWithSkills(
      auth,
      [imported],
      { variant: "full" }
    );

    return ctx.json({
      agentConfiguration: serialized,
      skippedActions,
    });
  }
);

export default app;

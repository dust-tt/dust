import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { patchAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import logger from "@app/logger/logger";
import type {
  DeleteAgentConfigurationResponseType,
  GetOrPatchAgentConfigurationResponseType,
} from "@dust-tt/client";
import { PatchAgentConfigurationRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import yaml from "./export/yaml";

const AgentConfigurationParamSchema = z.object({
  sId: z.string(),
});

const VariantQuerySchema = z.object({
  variant: z.enum(["light", "full"]).optional(),
});

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
 *                 type: boolean
 *               agent:
 *                 type: object
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
 *                 items:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     full_name:
 *                       type: string
 *               skills:
 *                 type: array
 *                 description: Replaces the skills enabled on the agent configuration.
 *                 items:
 *                   type: object
 *                   required:
 *                     - sId
 *                     - name
 *                   properties:
 *                     sId:
 *                       type: string
 *                     name:
 *                       type: string
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
 *         description: Successfully updated agent configuration
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
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Agent configuration not found.
 *       500:
 *         description: Internal Server Error.
 *   delete:
 *     summary: Archive agent configuration
 *     description: Archive the agent configuration identified by {sId} in the workspace identified by {wId}. The agent is soft-archived and triggers/editor-group memberships associated with it are disabled.
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
 *         description: Successfully archived agent configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Bad Request. Invalid or missing parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. The caller is not allowed to archive this agent.
 *       404:
 *         description: Agent configuration not found.
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/assistant/agent_configurations/:sId.
const app = publicApiApp();

app.route("/export/yaml", yaml);

app.get(
  "/",
  validate("param", AgentConfigurationParamSchema),
  validate("query", VariantQuerySchema),
  async (ctx): HandlerResult<GetOrPatchAgentConfigurationResponseType> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");
    const { variant } = ctx.req.valid("query");

    logger.info(
      { sId, url: ctx.req.url, path: ctx.req.path },
      "[v1] agent_configurations/:sId GET handler hit"
    );

    const configVariant = variant ?? "light";

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: sId,
      variant: configVariant,
    });

    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration you requested was not found.",
        },
      });
    }

    return ctx.json({
      agentConfiguration,
    });
  }
);

app.patch(
  "/",
  ensureIsBuilder(),
  validate("param", AgentConfigurationParamSchema),
  validate("json", PatchAgentConfigurationRequestSchema),
  async (ctx): HandlerResult<GetOrPatchAgentConfigurationResponseType> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: sId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration you requested was not found.",
        },
      });
    }

    // it's a public endpoint, so we need to check we are auth with a user, to set a favorite
    if (body.userFavorite !== undefined && auth.user()) {
      const updateRes = await setAgentUserFavorite({
        auth,
        agentId: sId,
        userFavorite: body.userFavorite,
      });

      if (updateRes.isOk()) {
        agentConfiguration.userFavorite = body.userFavorite;
      } else {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: updateRes.error.message,
          },
        });
      }
    }

    const { userFavorite: _userFavorite, ...configPatch } = body;
    const hasConfigPatch = Object.keys(configPatch).length > 0;

    if (hasConfigPatch) {
      const patchResult = await patchAgentConfigurationFromJSON(
        auth,
        sId,
        configPatch
      );

      if (patchResult.isErr()) {
        return apiError(ctx, patchResult.error);
      }

      return ctx.json({
        agentConfiguration: patchResult.value.agentConfiguration,
        skippedActions: patchResult.value.skippedActions,
      });
    }

    return ctx.json({
      agentConfiguration,
    });
  }
);

app.delete(
  "/",
  ensureIsBuilder(),
  validate("param", AgentConfigurationParamSchema),
  async (ctx): HandlerResult<DeleteAgentConfigurationResponseType> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: sId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration you requested was not found.",
        },
      });
    }

    // Space-scoping is enforced upstream: `getAgentConfiguration` (called above) returns null
    // when the auth's groups don't cover every `requestedSpaceId` of the agent, in which case
    // the handler 404s before reaching here. This matches the PATCH security model on this
    // route and means an API key scoped to a subset of spaces cannot archive agents tied to
    // spaces it can't see.
    const archived = await archiveAgentConfiguration(auth, sId);
    if (!archived) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration you requested was not found.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;

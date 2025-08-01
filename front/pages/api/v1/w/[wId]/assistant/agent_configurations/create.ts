import type {
  CreateAgentConfigurationWithDefaultsResponseType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/assistant_builder/avatar_picker/utils";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import { createGenericAgentConfigurationWithDefaultTools } from "@app/lib/api/assistant/configuration/agent";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getLargeWhitelistedModel } from "@app/types";

export const CreateAgentConfigurationWithDefaultsRequestSchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  emoji: t.union([t.string, t.undefined]),
  pictureUrl: t.union([t.string, t.undefined]),
  subAgentName: t.union([t.string, t.undefined]),
  subAgentDescription: t.union([t.string, t.undefined]),
  subAgentInstructions: t.union([t.string, t.undefined]),
  subAgentEmoji: t.union([t.string, t.undefined]),
});

function assistantHandleIsValid(handle: string) {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(handle);
}

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/agent_configurations/create:
 *   post:
 *     summary: Create agent with default tools
 *     description: Create a new agent configuration with default tools. Only accessible via system API keys and requires agent_management feature flag. Optionally create a sub-agent with the main agent having a run_agent tool to call it.
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
 *               - name
 *               - description
 *               - instructions
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the agent (without @). Only letters, numbers, underscores (_) and hyphens (-) are allowed. Maximum 30 characters.
 *               description:
 *                 type: string
 *                 description: A brief description of what the agent does
 *               instructions:
 *                 type: string
 *                 description: The prompt/instructions that define the agent's behavior
 *               emoji:
 *                 type: string
 *                 description: An emoji character to use as the agent's avatar (e.g., '🤖'). Mutually exclusive with pictureUrl.
 *               pictureUrl:
 *                 type: string
 *                 description: URL of an image to use as the agent's avatar. Mutually exclusive with emoji.
 *               subAgentName:
 *                 type: string
 *                 description: The name of the sub-agent to create. If subAgentInstructions is provided, this field is required.
 *               subAgentDescription:
 *                 type: string
 *                 description: A brief description of what the sub-agent does. If subAgentInstructions is provided, this field is required.
 *               subAgentInstructions:
 *                 type: string
 *                 description: The prompt/instructions that define the sub-agent's behavior. If provided, subAgentName and subAgentDescription are required.
 *               subAgentEmoji:
 *                 type: string
 *                 description: An emoji character to use as the sub-agent's avatar (e.g., '🤔'). Defaults to '🤖' if not provided.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully created agent configuration(s). If sub-agent parameters were provided, both the sub-agent and main agent are created, with the main agent having a run_agent tool configured to call the sub-agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentConfiguration:
 *                   $ref: '#/components/schemas/LightAgentConfiguration'
 *       400:
 *         description: Bad Request. Invalid parameters or validation failed. Common errors include missing required sub-agent fields when subAgentInstructions is provided.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. Not a system API key or missing agent_management feature flag.
 *       404:
 *         description: Workspace not found.
 *       405:
 *         description: Method not supported. Only POST is expected.
 *       500:
 *         description: Internal Server Error.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<CreateAgentConfigurationWithDefaultsResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      if (!auth.isSystemKey()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "This endpoint requires a system API key",
          },
        });
      }

      const owner = auth.workspace();
      if (!owner) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found",
          },
        });
      }

      const workspace = auth.getNonNullableWorkspace();
      const flags = await getFeatureFlags(workspace);
      if (!flags.includes("agent_management_tool")) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message:
              "The agent_management_tool feature flag is required to use this endpoint",
          },
        });
      }

      const bodyValidation =
        CreateAgentConfigurationWithDefaultsRequestSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const {
        name,
        description,
        instructions,
        emoji,
        pictureUrl,
        subAgentName,
        subAgentDescription,
        subAgentInstructions,
        subAgentEmoji,
      } = bodyValidation.right;

      if (emoji && pictureUrl) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Cannot specify both emoji and pictureUrl. Please provide only one.",
          },
        });
      }

      if (subAgentInstructions) {
        if (!subAgentName || subAgentName.trim() === "") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "subAgentName is required when subAgentInstructions is provided",
            },
          });
        }
        if (!subAgentDescription || subAgentDescription.trim() === "") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "subAgentDescription is required when subAgentInstructions is provided",
            },
          });
        }
      }

      // Validate agent name - no cleaning, just validation
      if (!name || name === "") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The agent name cannot be empty",
          },
        });
      }

      if (!assistantHandleIsValid(name)) {
        if (name.length > 30) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The agent name must be 30 characters or less",
            },
          });
        } else {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The agent name can only contain letters, numbers, underscores (_) and hyphens (-). Spaces and special characters are not allowed.",
            },
          });
        }
      }

      const model = getLargeWhitelistedModel(owner);
      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "No suitable model available for this workspace. Please ensure your workspace has access to at least one AI model provider.",
          },
        });
      }

      const agentModel = {
        providerId: model.providerId,
        modelId: model.modelId,
        temperature: 0.7,
        reasoningEffort: model.defaultReasoningEffort,
      };

      let finalPictureUrl: string;

      if (pictureUrl) {
        finalPictureUrl = pictureUrl;
      } else {
        const selectedEmoji = emoji || "🤖";
        const emojiData = buildSelectedEmojiType(selectedEmoji);

        if (emojiData) {
          finalPictureUrl = makeUrlForEmojiAndBackground(
            {
              id: emojiData.id,
              unified: emojiData.unified,
              native: emojiData.native,
            },
            "bg-blue-200"
          );
        } else {
          finalPictureUrl =
            "https://dust.tt/static/systemavatar/dust_avatar_full.png";
        }
      }

      let subAgentConfiguration: LightAgentConfigurationType | null = null;

      // Create a sub-agent if requested.
      if (subAgentInstructions) {
        if (!assistantHandleIsValid(subAgentName!)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The sub-agent name can only contain letters, numbers, underscores (_) and hyphens (-). Maximum 30 characters.",
            },
          });
        }

        // Build sub-agent avatar URL
        let subAgentPictureUrl: string;
        const selectedSubAgentEmoji = subAgentEmoji || "🤖";
        const subAgentEmojiData = buildSelectedEmojiType(selectedSubAgentEmoji);

        if (subAgentEmojiData) {
          subAgentPictureUrl = makeUrlForEmojiAndBackground(
            {
              id: subAgentEmojiData.id,
              unified: subAgentEmojiData.unified,
              native: subAgentEmojiData.native,
            },
            "bg-green-200"
          );
        } else {
          subAgentPictureUrl =
            "https://dust.tt/static/systemavatar/dust_avatar_full.png";
        }

        const subAgentResult =
          await createGenericAgentConfigurationWithDefaultTools(auth, {
            name: subAgentName!,
            description: subAgentDescription!,
            instructions: subAgentInstructions,
            pictureUrl: subAgentPictureUrl,
            model: agentModel,
          });

        if (subAgentResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to create sub-agent: ${subAgentResult.error.message}`,
            },
          });
        }

        subAgentConfiguration = subAgentResult.value;
      }

      // Create the main agent.
      const result = await createGenericAgentConfigurationWithDefaultTools(
        auth,
        {
          name,
          description,
          instructions,
          pictureUrl: finalPictureUrl,
          model: agentModel,
        }
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create agent: ${result.error.message}`,
          },
        });
      }

      const mainAgentConfiguration = result.value;

      // If we created a sub-agent, add the run_agent tool to the main agent
      if (subAgentConfiguration) {
        const runAgentMCPServerView =
          await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
            auth,
            "run_agent"
          );

        if (!runAgentMCPServerView) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Could not find run_agent MCP server view",
            },
          });
        }

        const runAgentResult = await createAgentActionConfiguration(
          auth,
          {
            type: "mcp_server_configuration",
            name: `run_${subAgentConfiguration.name}`,
            description: `Run the ${subAgentConfiguration.name} sub-agent`,
            mcpServerViewId: runAgentMCPServerView.sId,
            dataSources: null,
            reasoningModel: null,
            tables: null,
            childAgentId: subAgentConfiguration.sId,
            additionalConfiguration: {},
            dustAppConfiguration: null,
            timeFrame: null,
            jsonSchema: null,
          } as ServerSideMCPServerConfigurationType,
          mainAgentConfiguration
        );

        if (runAgentResult.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Could not create run_agent action configuration",
            },
          });
        }
      }

      return res.status(200).json({
        agentConfiguration: mainAgentConfiguration,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported. Only POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);

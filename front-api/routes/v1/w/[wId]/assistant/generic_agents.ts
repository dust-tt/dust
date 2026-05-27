import { createGenericAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  assistantHandleIsValid,
  getAgentPictureUrl,
} from "@app/lib/api/assistant/configuration/generic_agent_helpers";
import { getLargeWhitelistedModel } from "@app/lib/api/assistant/models";
import type { CreateGenericAgentConfigurationResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const CreateGenericAgentRequestSchema = z.object({
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  emoji: z.string().optional(),
  subAgentName: z.string().optional(),
  subAgentDescription: z.string().optional(),
  subAgentInstructions: z.string().optional(),
  subAgentEmoji: z.string().optional(),
});

/**
 * @ignoreswagger
 */

// Mounted at /api/v1/w/:wId/assistant/generic_agents.
const app = publicApiApp();

app.post(
  "/",
  withFeatureFlag("agent_management_tool", {
    message:
      "The agent_management_tool feature flag is required to use this endpoint",
  }),
  validate("json", CreateGenericAgentRequestSchema),
  async (ctx): HandlerResult<CreateGenericAgentConfigurationResponseType> => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "This endpoint requires a system API key",
        },
      });
    }

    const owner = auth.workspace();
    if (!owner) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found",
        },
      });
    }

    const {
      name,
      description,
      instructions,
      emoji,
      subAgentName,
      subAgentDescription,
      subAgentInstructions,
      subAgentEmoji,
    } = ctx.req.valid("json");

    if (subAgentInstructions) {
      if (!subAgentName || subAgentName.trim() === "") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "subAgentName is required when subAgentInstructions is provided",
          },
        });
      }
      if (!subAgentDescription || subAgentDescription.trim() === "") {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "subAgentDescription is required when subAgentInstructions is provided",
          },
        });
      }
    }

    if (!name || name === "") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The agent name cannot be empty",
        },
      });
    }

    if (!assistantHandleIsValid(name)) {
      if (name.length > 30) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The agent name must be 30 characters or less",
          },
        });
      } else {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The agent name can only contain letters, numbers, underscores (_) and hyphens (-). Spaces and special characters are not allowed.",
          },
        });
      }
    }

    const model = await getLargeWhitelistedModel(auth);
    if (!model) {
      return apiError(ctx, {
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

    const agentPictureUrl = getAgentPictureUrl(emoji, "bg-blue-200");

    // Prepare sub-agent configuration if requested
    let subAgentConfig = undefined;
    if (subAgentInstructions) {
      if (!assistantHandleIsValid(subAgentName!)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The sub-agent name can only contain letters, numbers, underscores (_) and hyphens (-). Maximum 30 characters.",
          },
        });
      }

      const subAgentPictureUrl = getAgentPictureUrl(
        subAgentEmoji,
        "bg-green-200"
      );

      subAgentConfig = {
        name: subAgentName!,
        description: subAgentDescription!,
        instructions: subAgentInstructions,
        pictureUrl: subAgentPictureUrl,
      };
    }

    // Create the main agent (which will also create the sub-agent if configured)
    const result = await createGenericAgentConfiguration(auth, {
      name,
      description,
      instructions,
      pictureUrl: agentPictureUrl,
      model: agentModel,
      subAgent: subAgentConfig,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to create agent: ${result.error.message}`,
        },
      });
    }

    return ctx.json({
      agentConfiguration: result.value.agentConfiguration,
      subAgentConfiguration: result.value.subAgentConfiguration,
    });
  }
);

export default app;

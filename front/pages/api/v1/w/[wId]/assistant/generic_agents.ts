import type { CreateGenericAgentConfigurationResponseType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/agent_builder/settings/avatar_picker/utils";
import { createGenericAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getLargeWhitelistedModel } from "@app/types";

export const CreateGenericAgentRequestSchema = t.type({
  name: t.string,
  description: t.string,
  instructions: t.string,
  emoji: t.union([t.string, t.undefined]),
  subAgentName: t.union([t.string, t.undefined]),
  subAgentDescription: t.union([t.string, t.undefined]),
  subAgentInstructions: t.union([t.string, t.undefined]),
  subAgentEmoji: t.union([t.string, t.undefined]),
});

function assistantHandleIsValid(handle: string) {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(handle);
}

function getAgentPictureUrl(
  emoji: string | undefined,
  backgroundColor: `bg-${string}`
): string {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const selectedEmoji = emoji || "🤖";
  const emojiData = buildSelectedEmojiType(selectedEmoji);

  if (emojiData) {
    return makeUrlForEmojiAndBackground(
      {
        id: emojiData.id,
        unified: emojiData.unified,
        native: emojiData.native,
      },
      backgroundColor
    );
  } else {
    return "https://dust.tt/static/systemavatar/dust_avatar_full.png";
  }
}

/**
 * @ignoreswagger
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<CreateGenericAgentConfigurationResponseType>
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

      const bodyValidation = CreateGenericAgentRequestSchema.decode(req.body);
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
        subAgentName,
        subAgentDescription,
        subAgentInstructions,
        subAgentEmoji,
      } = bodyValidation.right;

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

      const agentPictureUrl = getAgentPictureUrl(emoji, "bg-blue-200");

      // Prepare sub-agent configuration if requested
      let subAgentConfig = undefined;
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create agent: ${result.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: result.value.agentConfiguration,
        subAgentConfiguration: result.value.subAgentConfiguration,
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

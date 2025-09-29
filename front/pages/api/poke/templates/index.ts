import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { WithAPIErrorResponse } from "@app/types";
import { isDevelopment } from "@app/types";
import { CreateTemplateFormSchema, isTemplateTagCodeArray } from "@app/types";

export interface CreateTemplateResponseBody {
  success: boolean;
}

interface PokeFetchAssistantTemplatesResponse {
  templates: AssistantTemplateListType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      CreateTemplateResponseBody | PokeFetchAssistantTemplatesResponse
    >
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const templates = await TemplateResource.listAll();

      return res
        .status(200)
        .json({ templates: templates.map((t) => t.toListJSON()) });

    case "POST":
      const bodyValidation = CreateTemplateFormSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      if (!isTemplateTagCodeArray(body.tags)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid: tags must be an array of template tag names.",
          },
        });
      }

      if (regionConfig.getDustRegionSyncEnabled() && !isDevelopment()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Cannot create templates in non-main regions.",
          },
        });
      }

      const model = USED_MODEL_CONFIGS.find(
        (config) => config.modelId === body.presetModelId
      );

      if (!model) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is invalid: model not found.",
          },
        });
      }

      await TemplateResource.makeNew({
        backgroundColor: body.backgroundColor,
        description: body.description ?? null,
        emoji: body.emoji,
        handle: body.handle,
        helpActions: body.helpActions ?? null,
        helpInstructions: body.helpInstructions ?? null,
        presetActions: body.presetActions,
        presetDescription: null,
        presetInstructions: body.presetInstructions ?? null,
        presetModelId: model.modelId,
        presetProviderId: model.providerId,
        // Not configurable in the template, keeping the column for now since some templates do
        // have a custom temperature.
        // TODO(2025-09-29 aubin): update old templates to remove temperature setting.
        //  Dependent on fixing it in Agent Builder.
        presetTemperature: "balanced",
        tags: body.tags,
        visibility: body.visibility,
      });

      res.status(200).json({
        success: true,
      });
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);

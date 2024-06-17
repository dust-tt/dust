import type { WithAPIErrorReponse } from "@dust-tt/types";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { Authenticator, getSession } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { generateModelSId } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { AssistantTemplateListType } from "@app/pages/api/w/[wId]/assistant/builder/templates";

export interface CreateTemplateResponseBody {
  success: boolean;
}

interface PokeFetchAssistantTemplatesResponse {
  templates: AssistantTemplateListType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      CreateTemplateResponseBody | PokeFetchAssistantTemplatesResponse
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
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
        presetAction: body.presetAction,
        presetActions: body.presetActions,
        presetDescription: null,
        presetInstructions: body.presetInstructions ?? null,
        presetModelId: model.modelId,
        presetProviderId: model.providerId,
        presetTemperature: body.presetTemperature ?? null,
        sId: generateModelSId(),
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

export default withLogging(handler);

import type { WithAPIErrorReponse } from "@dust-tt/types";
import {
  CreateTemplateFormSchema,
  isAssistantTemplateTagNameTypeArray,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";
import { v4 as uuidv4 } from "uuid";

import { USED_MODEL_CONFIGS } from "@app/components/assistant_builder/InstructionScreen";
import { Authenticator, getSession } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type CreateTemplateResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<CreateTemplateResponseBody>>
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

      if (!isAssistantTemplateTagNameTypeArray(body.tags)) {
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
        (config) => config.modelId === body.presetModel
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
        sId: uuidv4(),
        name: body.name,
        description: body.description ?? null,
        presetHandle: body.presetHandle ?? null,
        presetInstructions: body.presetInstructions ?? null,
        presetTemperature: body.presetTemperature ?? null,
        presetAction: body.presetAction,
        helpInstructions: body.helpInstructions ?? null,
        helpActions: body.helpActions ?? null,
        tags: body.tags,
        presetProviderId: model.providerId,
        presetModelId: model.modelId,
        // TODO
        visibility: "draft",
        presetDescription: null,
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

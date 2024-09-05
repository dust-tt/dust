import type { WithAPIErrorResponse } from "@dust-tt/types";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";

export type PokeFetchAssistantTemplateResponse = ReturnType<
  TemplateResource["toJSON"]
>;

interface PokeCreateTemplateResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PokeCreateTemplateResponseBody | PokeFetchAssistantTemplateResponse
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

  const { tId: templateId } = req.query;
  if (!templateId || typeof templateId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Could not find the template.",
      },
    });
  }

  let template: TemplateResource | null = null;

  switch (req.method) {
    case "GET":
      template = await TemplateResource.fetchByExternalId(templateId);
      if (!template) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Could not find the template.",
          },
        });
      }

      return res.status(200).json(template);

    case "PATCH":
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

      const existingTemplate =
        await TemplateResource.fetchByExternalId(templateId);
      if (!existingTemplate) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Could not find the template.",
          },
        });
      }

      await existingTemplate.update({
        backgroundColor: body.backgroundColor,
        description: body.description ?? null,
        emoji: body.emoji,
        handle: body.handle,
        helpActions: body.helpActions ?? null,
        helpInstructions: body.helpInstructions ?? null,
        presetActions: body.presetActions,
        timeFrameDuration: body.timeFrameDuration
          ? parseInt(body.timeFrameDuration)
          : null,
        timeFrameUnit: body.timeFrameUnit || null,
        presetDescription: null,
        presetInstructions: body.presetInstructions ?? null,
        presetModelId: model.modelId,
        presetProviderId: model.providerId,
        presetTemperature: body.presetTemperature,
        tags: body.tags,
        visibility: body.visibility,
      });

      res.status(200).json({
        success: true,
      });
      break;

    case "DELETE":
      template = await TemplateResource.fetchByExternalId(templateId);
      if (!template) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Could not find the template.",
          },
        });
      }

      await template.delete(auth);

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

export default withSessionAuthentication(handler);

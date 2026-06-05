/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type {
  PokeCreateTemplateResponseBody,
  PokeFetchAssistantTemplateResponse,
} from "@app/lib/api/poke/templates";
import { buildSharedTemplateAttributes } from "@app/lib/api/poke/templates";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";
import {
  CreateTemplateFormSchema,
  isTemplateTagCodeArray,
} from "@app/types/assistant/templates";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isDevelopment } from "@app/types/shared/env";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PokeCreateTemplateResponseBody | PokeFetchAssistantTemplateResponse
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

      if (regionConfig.getDustRegionSyncEnabled() && !isDevelopment()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Cannot update templates in non-main regions.",
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

      await existingTemplate?.updateAttributes({
        ...buildSharedTemplateAttributes({ ...body, tags: body.tags }, model),
        timeFrameDuration: body.timeFrameDuration
          ? parseInt(body.timeFrameDuration, 10)
          : null,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        timeFrameUnit: body.timeFrameUnit || null,
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
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);

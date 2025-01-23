import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError, withLogging } from "@app/logger/withlogging";

export type FetchAssistantTemplateResponse = ReturnType<
  TemplateResource["toJSON"]
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FetchAssistantTemplateResponse>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      const { tId: templateId } = req.query;
      if (!templateId || typeof templateId !== "string") {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Template not found.",
          },
        });
      }

      const template = await TemplateResource.fetchByExternalId(templateId);
      if (!template || !template.isPublished()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: "Template not found.",
          },
        });
      }

      return res.status(200).json(template.toJSON());

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

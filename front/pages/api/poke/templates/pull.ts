import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { config } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TemplateResource } from "@app/lib/resources/template_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { WithAPIErrorResponse } from "@app/types";

export type PullTemplatesResponseBody = {
  success: true;
  count: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PullTemplatesResponseBody>>,
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

  if (!config.getDustRegionSyncEnabled()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This endpoint can only be called from non-main regions.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const mainRegionUrl = config.getDustRegionSyncMasterUrl();
      const response = await fetch(`${mainRegionUrl}/api/templates`, {
        method: "GET",
      });

      if (!response.ok) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch templates from main region.",
          },
        });
      }

      const templatesResponse: FetchAssistantTemplatesResponse =
        await response.json();
      let count = 0;

      for (const templateFromList of templatesResponse.templates) {
        const templateResponse = await fetch(
          `${mainRegionUrl}/api/templates/${templateFromList.sId}`,
          {
            method: "GET",
          }
        );

        if (!templateResponse.ok) {
          logger.error(
            `Failed to fetch template ${templateFromList.sId}: ${templateResponse.status}`
          );
          continue;
        }

        const template: FetchAssistantTemplateResponse =
          await templateResponse.json();

        await TemplateResource.upsertByHandle(template);

        count++;
      }

      return res.status(200).json({
        success: true,
        count,
      });

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

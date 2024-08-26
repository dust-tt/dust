import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";

export type AssistantTemplateListType = ReturnType<
  TemplateResource["toListJSON"]
>;

export interface FetchAssistantTemplatesResponse {
  templates: AssistantTemplateListType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FetchAssistantTemplatesResponse>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      const templates = await TemplateResource.listAll({
        visibility: "published",
      });

      return res
        .status(200)
        .json({ templates: templates.map((t) => t.toListJSON()) });

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

export default withSessionAuthenticationForWorkspaceAsUser(handler);

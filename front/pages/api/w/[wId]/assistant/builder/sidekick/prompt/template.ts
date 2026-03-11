import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

function buildTemplateAgentInitMessage({
  handle,
  sidekickInstructions,
  agentFacingDescription,
}: TemplateResource): string {
  return `<dust_system>
The user is creating a new agent based on the "${handle}" template.
NEVER call \`get_agent_config\` in this first message.
Here is a brief description of what the agent should do:

<description>
${agentFacingDescription}
</description>

Follow the <using_templates> section from your instructions to act on the sidekickInstructions below.

<sidekickInstructions>
${sidekickInstructions}
</sidekickInstructions>
</dust_system>`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  const { templateId } = req.query;

  if (!isString(templateId)) {
    return apiError(req, res, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: `The templateId query parameter is invalid or missing.`,
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const template = await TemplateResource.fetchByExternalId(templateId);

      if (!template || !template.sidekickInstructions) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: `Template with id ${templateId} not found.`,
          },
        });
      }

      return res.status(200).json(buildTemplateAgentInitMessage(template));
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

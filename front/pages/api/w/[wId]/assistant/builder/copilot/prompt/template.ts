import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

function buildTemplateAgentInitMessage({
  handle,
  copilotInstructions,
  agentFacingDescription,
}: TemplateResource): string {
  return `<dust_system>
The user is creating a new agent based on the "${handle}" template.
Here is a brief description of what the agent should do:

<description>
${agentFacingDescription}
</description>

The copilotInstructions below contain domain-specific guidance for this agent type, structured as:
- <Business_Requirements>: Specific clarifying questions that will help you customize the template to the user's needs.
- <Capabilities_To_Suggest>: Tools and skills to suggest, ordered by priority
- <Knowledge_To_Suggest>: Knowledge to suggest, ordered by priority

## How to act on copilotInstructions

### 1. Business requirements
First try to answer the questions as best as you can based on your user_context and workspace_context.
If needed, you can perform multiple targeted searches on the knowledge sources of the workspace to enrich your context.

### 2. Make suggestions
At this stage, the agent configuration will always be empty. Start to fill in instructions and capabilities based on what you know now. Start small, the goal is not to overwhelm the user with too much suggestions, but to iterate with him step by step.

### 3. Refinements
Ask the user the unresolved questions if any and engage with him to further refine the template to his use case.

<copilotInstructions>
${copilotInstructions}
</copilotInstructions>
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
    case "GET":
      const template = await TemplateResource.fetchByExternalId(templateId);

      if (!template || !template.copilotInstructions) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "template_not_found",
            message: `Template with id ${templateId} not found.`,
          },
        });
      }

      return res.status(200).json(buildTemplateAgentInitMessage(template));
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

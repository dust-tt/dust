import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

function buildTemplateAgentInitMessage(
  templateCopilotInstructions: string
): string {
  return `<dust_system>
NEW agent from TEMPLATE.

The copilotInstructions below contain domain-specific guidance for this agent type, structured as:
- <Business_Requirements>: Questions that need answers to build this agent properly
- <Capabilities_To_Suggest>: Tools and skills to suggest, ordered by priority
- <Knowledge_To_Suggest>: Data sources and knowledge to suggest

## How to act on copilotInstructions

### 1. Gather workspace context
Use \`get_available_skills\`, \`get_available_tools\`, \`get_available_knowledge\`, and \`search_knowledge\` to discover what's configured in the workspace.

### 2. Answer business requirements from workspace data
<Business_Requirements> lists the questions that need answers to properly build this agent. These answers depend on what's available in the workspace. Use the workspace context from step 1 to answer as many as possible. Only ask the user questions you could NOT resolve from workspace data.

### 3. Create suggestions immediately
Use \`suggest_*\` tools informed by workspace context. Do NOT wait for user response:
- \`suggest_prompt_edits\`: Generate agent instructions inferred from gathered workspace context and resolved business requirements. Refer to your agent instructions guidelines.
- \`suggest_tools\`, \`suggest_skills\`, \`suggest_knowledge\`: Suggest capabilities and data sources following the priority order in copilotInstructions

<copilotInstructions>
${templateCopilotInstructions}
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

      return res
        .status(200)
        .json(buildTemplateAgentInitMessage(template.copilotInstructions));
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

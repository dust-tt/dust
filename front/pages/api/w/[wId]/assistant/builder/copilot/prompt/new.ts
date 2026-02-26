import {
  formatTemplatesAsText,
  getTemplatesForCopilot,
} from "@app/lib/api/assistant/copilot_templates";
import { fetchLangfuseFirstMessagePrompt } from "@app/lib/api/assistant/global_agents/langfuse_prompts";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { JobType } from "@app/types/job_type";
import { isJobType } from "@app/types/job_type";
import type { NextApiRequest, NextApiResponse } from "next";

const NEW_AGENT_TEMPLATES_LIMIT = 20;

async function getJobTypeFromAuth(
  auth: Authenticator
): Promise<JobType | undefined> {
  const user = auth.user();
  if (!user) {
    return undefined;
  }
  const meta = await user.getMetadata("job_type");
  return meta?.value && isJobType(meta.value) ? meta.value : undefined;
}

async function getTemplatesMarkdown(
  auth: Authenticator,
  jobType?: JobType
): Promise<string> {
  const res = await getTemplatesForCopilot({
    auth,
    jobType,
    limit: NEW_AGENT_TEMPLATES_LIMIT,
  });
  const templates = res.isErr() ? [] : res.value;
  const body = formatTemplatesAsText(templates);
  return `<agent_templates>\n${body}\n</agent_templates>`;
}

function buildFirstMessage(templatesMarkdown: string): string {
  return `<dust_system>
This is a new agent. To start the conversation, you should NOT call tools to acquire insights, feedback, or agent configuration given it is all empty.

${templatesMarkdown}

## STEP 1: Discover templates & suggest use cases

Provide 2-3 specific agent use case suggestions. PRIORITIZE templates from the injected <agent_templates> section. Determine priority based on the user's job function, preferred platforms, and userFacingDescription of the templates.

IMPORTANT: Use case suggestions MUST use the \`:quickReply\` directive format so users can click to select. Do NOT use bullet points. Do NOT put any text after the last \`:quickReply\` directive — the buttons are self-explanatory.
Example:
"I can help you build agents for your work in [role/team]. Here are a few ideas, or tell me if you have another idea in mind:

:quickReply[Meeting prep agent - pulls prospect info from CRM]{message="I want to build a meeting prep agent that pulls prospect info from CRM before calls"}
:quickReply[Follow-up drafter - generates personalized emails]{message="I want to build a follow-up drafter that generates personalized emails based on call notes"}
:quickReply[Competitive intel - monitors competitor news]{message="I want to build a competitive intel agent that monitors competitor news and surfaces updates"}"

## STEP 2: Response
Respond with the use case suggestions. Provide a succinct explanation that the user can also input a free answer if they do not want to select one of the suggested templates.

Users do not necessarily know they are using a pre-defined template. Avoid using that phrasing in your response.

## Step 3: Follow-ups
If the user selects a template, follow <using_templates> section from your instructions.
From that point, follow the core workflow from main instructions.

</dust_system>`;
}

// TODO: This will be deleted after we deploy changes to stop using on the client side.
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const { copilotEdge } = req.query;
      const jobType = await getJobTypeFromAuth(auth);
      const templatesMarkdown = await getTemplatesMarkdown(auth, jobType);

      if (copilotEdge !== "true") {
        return res.status(200).json(buildFirstMessage(templatesMarkdown));
      }

      const result = await fetchLangfuseFirstMessagePrompt(
        "copilot-edge-first-message-new",
        { templatesMarkdown }
      );
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to generate copilot prompt.",
          },
        });
      }

      return res.status(200).json(result.value);
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

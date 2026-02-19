import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

const firstMessage = `<dust_system>
EXISTING agent.

## STEP 1: Gather context
You MUST call these tools simultaneously in the same tool call round:
1. \`get_agent_config\` - to retrieve the current agent configuration and any pending suggestions
3. \`get_agent_feedback\` - to retrieve feedback for the current version

CRITICAL: All tools must be called together in parallel, not sequentially. Make all tool calls in your first response to minimize latency.

## STEP 2: Provide context & prompt action
Based on gathered data, provide a brief summary:
- If reinforced suggestions exist (source="reinforcement"), highlight them
- If negative feedback patterns exist, mention the top issue
- If pending suggestions exist from \`get_agent_config\`, output their directives to render them as cards:
  CRITICAL: For each suggestion, output: \`:agent_suggestion[]{sId=<sId> kind=<kind>}\`

## STEP 3: Evaluate & create suggestions
Follow the core workflow from your main instructions.
Create suggestions in your first response. Do not wait for the user to respond. If you see improvements, suggest them now. Add clarifying questions only after creating suggestions.

Tool usage:
- \`get_available_skills\`: Call FIRST. Bias towards skills.,
- \`get_available_tools\`: Only if clearly needed. If the desired agent is not specialized but meant to be multi-purpose, suggest "Discover Tools" skill instead.,
- \`search_knowledge\`: When use case involves specific data needs (documents, records, databases).,
- \`get_agent_insights\`: Only if you need additional information to improve the agent.,
- \`get_available_models\`: Only if user explicitly asks OR obvious need.

Use \`suggest_*\` tools to create actionable suggestions. Brief explanation (3-4 sentences max). Each tool returns a markdown directive — include it verbatim in your response. NEVER write suggestion directives yourself; only use the exact output from completed tool calls.

Balance context gathering and minimizing the number of tool calls - the first copilot message should be fast but helpful in driving builder actions.
</dust_system>`;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<string>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      return res.status(200).json(firstMessage);
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

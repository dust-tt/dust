import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import {
  _getFeedbackAnalyzerIncludeDataToolConfiguration,
  _getInteractiveContentToolConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentConfigurationType } from "@app/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

export function _getFeedbackAnalyzerGlobalAgent({
  auth,
  settings,
  interactiveContentMCPServerView,
  includeDataMCPServerView,
}: {
  auth: Authenticator;
  settings: GlobalAgentSettings | null;
  interactiveContentMCPServerView: MCPServerViewResource | null;
  includeDataMCPServerView: MCPServerViewResource | null;
}): AgentConfigurationType | null {
  const sId = GLOBAL_AGENTS_SID.FEEDBACK_ANALYZER;
  const metadata = getGlobalAgentMetadata(sId);

  const instructions = `<primary_goal>
You analyze agent feedback comments, identify themes, outliers, and trends over time, and propose actionable improvements.
</primary_goal>

<guidelines>
${globalAgentGuidelines}
- Be objective and specific; quantify where possible.
- Group insights by agent, user segment, and time period when relevant.
- Highlight regressions, recurring issues, and high-impact opportunities.
- When a visual or structured summary aids comprehension, create an Interactive Content frame.

## Input Format 
You'll receive feedback as a csv file with:
- feedback_content: User's feedback text
- thumbDirection: "up" or "down"
- feedback_created_at: Timestamp
- agent_message_content: The agent's response that received feedback

## Step-by-Step Process
Analyze feedback:
- Focus on thumbs down feedback for issues
- Review thumbs up feedback to understand what works well
- Categorize issues into themes (Response Quality, Accuracy, Tool Usage, etc.)
- Count frequency of each issue type
- Prioritize: High: 5+ mentions, Medium: 2-4, Low: 1
- Generate specific actions to improve the instruction (e.g. "Edit your agent instructions → Add 'Search company data first, then web search'")

## Design guideline
Retrieve the content of the attached template Frame 
**You must:**
- Use the exact same layout, component structure, and styling from the template
- Maintain consistent colors, spacing, and fonts
- Only change: dates, numbers, categories, issues, actions, priorities
- Preserve all className attributes and inline styles exactly
</guidelines>`;

  const owner = auth.getNonNullableWorkspace();
  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  if (!modelConfiguration) {
    return null;
  }

  const model = {
    providerId: modelConfiguration.providerId,
    modelId: modelConfiguration.modelId,
    temperature: 0.5,
    reasoningEffort: modelConfiguration.defaultReasoningEffort,
  };

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions,
    pictureUrl: metadata.pictureUrl,
    status: settings?.status ?? "active",
    scope: "global",
    userFavorite: false,
    model,
    actions: [
      ..._getInteractiveContentToolConfiguration({
        agentId: sId,
        interactiveContentMCPServerView,
      }),
      ..._getFeedbackAnalyzerIncludeDataToolConfiguration({
        agentId: sId,
        includeDataMCPServerView,
      }),
    ],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

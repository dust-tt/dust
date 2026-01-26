import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { CopilotUserMetadata } from "@app/lib/api/assistant/global_agents/global_agents";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentConfigurationType } from "@app/types";
import {
  getLargeWhitelistedModel,
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";
import { JOB_TYPE_LABELS } from "@app/types/job_type";

interface CopilotMCPServerViews {
  context: MCPServerViewResource;
  agentState: MCPServerViewResource;
}

function buildCopilotInstructions(
  userMetadata: CopilotUserMetadata | null
): string {
  const parts: string[] = [];

  // Static instructions
  parts.push(`
You are the Dust Agent Copilot, an expert assistant helping users build and improve their Dust agents.

## YOUR ROLE

You help users optimize their agents by:
1. Analyzing the current agent configuration (instructions, model, tools, skills)
2. Reviewing user feedback and usage insights
3. Suggesting actionable improvements

## CRITICAL RULES

1. **Always start by gathering context** - Use your tools to understand the agent before making suggestions
2. **Be specific and actionable** - Don't give vague advice. Reference actual configuration details.
3. **Prioritize high-impact changes** - Focus on improvements that will meaningfully affect agent performance
4. **Respect user intent** - Understand what the agent is meant to do before suggesting changes

## AVAILABLE TOOLS

You have access to these tools to gather information:

### Live Agent State (from builder form)
- **get_agent_config**: Get the current UNSAVED agent configuration from the builder form (name, description, instructions, model, tools, skills). Use this to see what the user is currently editing.

### Saved Agent State & Analytics
- **get_agent_info**: Get the last SAVED version of the agent configuration
- **get_available_models**: List available models the agent could use
- **get_available_skills**: List skills that could be added to the agent
- **get_available_tools**: List tools (MCP servers) that could be added
- **get_agent_feedback**: Get user feedback (thumbs up/down with comments)
- **get_agent_insights**: Get usage analytics (active users, conversations, feedback stats)

## IMPROVEMENT AREAS TO CONSIDER

When analyzing an agent, consider:

**Instructions**
- Are they clear and specific?
- Do they handle edge cases?
- Is the tone appropriate for the use case?

**Model Selection**
- Is the model appropriate for the task complexity?
- Would a different model provide better cost/performance tradeoff?

**Tools & Skills**
- Are the right tools enabled for the agent's purpose?
- Are there missing capabilities that would help?
- Are there unused tools that could be removed?

**Based on Feedback**
- What are users complaining about?
- What's working well that should be preserved?
- Are there patterns in negative feedback?

## RESPONSE STYLE

- Be direct and helpful
- Use bullet points for actionable suggestions
- When suggesting instruction changes, provide example text
- Always explain WHY a change would help
  `);

  // Add user context if available
  if (
    userMetadata &&
    (userMetadata.jobType || userMetadata.favoritePlatforms.length > 0)
  ) {
    const jobTypeLabel = userMetadata.jobType
      ? JOB_TYPE_LABELS[userMetadata.jobType]
      : "Not specified";
    const platforms =
      userMetadata.favoritePlatforms.join(", ") || "None specified";

    parts.push(`
## USER CONTEXT

The user building this agent has the following profile:
- Job function: ${jobTypeLabel}
- Preferred platforms: ${platforms}

Consider their role and platform preferences when suggesting tools and improvements.
    `);
  }

  return parts.join("\n\n");
}

export function _getCopilotGlobalAgent(
  auth: Authenticator,
  {
    copilotMCPServerViews,
    copilotUserMetadata,
  }: {
    copilotMCPServerViews: CopilotMCPServerViews | null;
    copilotUserMetadata: CopilotUserMetadata | null;
  }
): AgentConfigurationType {
  const owner = auth.getNonNullableWorkspace();

  const actions = copilotMCPServerViews
    ? [
        buildServerSideMCPServerConfiguration({
          mcpServerView: copilotMCPServerViews.context,
        }),
        buildServerSideMCPServerConfiguration({
          mcpServerView: copilotMCPServerViews.agentState,
        }),
      ]
    : [];

  const modelConfiguration = getLargeWhitelistedModel(owner);
  const model = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.COPILOT);
  const instructions = buildCopilotInstructions(copilotUserMetadata);

  return {
    id: -1,
    sId: metadata.sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.sId,
    description: metadata.description,
    instructions,
    pictureUrl: metadata.pictureUrl,
    status: "active",
    scope: "global",
    userFavorite: false,
    model,
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

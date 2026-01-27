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
}

function buildCopilotInstructions(
  userMetadata: CopilotUserMetadata | null
): string {
  const parts: string[] = [];

  // Static instructions
  parts.push(`
You are the Dust Agent Copilot, helping users build and improve agents.

## RESPONSE STYLE - CRITICAL

**Be extremely concise.** Users won't read long messages in the copilot tab.
- Max 4-5 short bullet points per response
- No fluff, no preamble, no "I can help you with..."
- Lead with the most valuable suggestion
- Use action verbs: "Add...", "Change...", "Remove..."
- Skip explanations unless asked - just give the suggestion

Example good response:
"Based on feedback patterns:
• Add error handling for empty inputs - 40% of complaints
• Switch to haiku model - similar quality, 3x faster"

Example bad response:
"I've analyzed your agent configuration and found several areas where improvements could be made. Let me walk you through my findings..."

## TOOLS

### Read state
- **get_agent_config**: Live builder form state (name, instructions, model, tools, skills)
- **get_agent_feedback**: User feedback (params: limit, filter: "active"|"all")
- **get_agent_insights**: Usage stats (params: days, default 30)
- **list_suggestions**: Existing suggestions (params: states, kind, limit) - prioritize source="reinforcement"
- **get_available_models/skills/tools**: What can be added

### Create suggestions (USER CAN ACCEPT/REJECT)
Use these to create actionable suggestion cards - much better than describing changes in text:
- **suggest_prompt_editions**: Suggest instruction changes (params: suggestions[], analysis)
- **suggest_tools**: Suggest adding tools (params: suggestion, analysis)
- **suggest_skills**: Suggest adding skills (params: suggestion, analysis)
- **suggest_model**: Suggest model change (params: suggestion, analysis)

## WORKFLOW VISUALIZATION

When users ask for a diagram/visualization of the agent, or when explaining complex workflows:

1. Use \`get_agent_config\` to get instructions, tools, skills
2. Choose diagram type based on agent structure:
   - Sequential steps → flowchart TB or LR
   - Conditional logic → flowchart with decision nodes
   - Multi-actor workflows → sequence diagram
   - State transitions → state diagram

3. Generate mermaid code block:
\`\`\`mermaid
flowchart TB
    A[User Input] --> B{Check Type}
    B -->|Type A| C[Use Tool X]
    B -->|Type B| D[Use Tool Y]
    C --> E[Return Response]
    D --> E
\`\`\`

### Guidelines
- Keep diagrams focused (5-10 nodes max)
- Use descriptive labels matching actual tools/steps in instructions
- For complex agents, offer multiple focused diagrams
- Simple agents (single tool, no conditionals) → simple 3-4 node flowchart

### Trigger Phrases
Respond to: "show diagram", "visualize", "workflow diagram", "how does this agent work"

### Updates
When user modifies agent after viewing diagram, offer: "I can update the diagram to reflect your changes."
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

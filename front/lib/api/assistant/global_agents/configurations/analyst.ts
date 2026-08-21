import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  AUTO_FAST_MODEL_CONFIG,
  AUTO_MODEL_CONFIG,
} from "@app/types/assistant/models/auto";

export function _getAnalystGlobalAgent({
  auth,
}: {
  auth: Authenticator;
}): AgentConfigurationType {
  const prompt = `<primary_goal>
You are @analyst, an analytics assistant for workspace admins and managers. You help them understand how their Dust workspace is being used by answering questions with data retrieved through your tools.
</primary_goal>

<guidelines>
1. Only report figures returned by your tools — never estimate or fabricate numbers.
2. Use the workspace analytics tools to answer the question (e.g. which agents are used most). Present results as clear ranked lists or summaries.
3. When a chart communicates the result better than text (trends over time, distributions, comparisons), use the Frames skill to render it. Default to a concise text answer for single figures.
4. If a tool reports an authorization error, explain that workspace analytics is restricted to workspace admins and managers.
5. Be concise and lead with the answer; add brief context only when it helps interpretation.
</guidelines>`;

  // Standard auto stream for upgraded workspaces, Basic one otherwise. Both
  // sentinels are resolved to a concrete model + effort at message-send time by
  // resolveModel().
  const modelConfiguration = auth.isUpgraded()
    ? AUTO_MODEL_CONFIG
    : AUTO_FAST_MODEL_CONFIG;

  const model: AgentModelConfigurationType = {
    providerId: modelConfiguration.providerId,
    modelId: modelConfiguration.modelId,
    temperature: 0.2,
    reasoningEffort: modelConfiguration.defaultReasoningEffort,
  };

  const sId = GLOBAL_AGENTS_SID.ANALYST;
  const metadata = getGlobalAgentMetadata(sId);

  return {
    id: -1,
    sId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: metadata.name,
    description: metadata.description,
    instructions: prompt + globalAgentGuidelines,
    instructionsHtml: null,
    pictureUrl: metadata.pictureUrl,
    status: "active",
    userFavorite: false,
    scope: "global",
    model,
    actions: [],
    skills: ["workspace-analytics", "frames"],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };
}

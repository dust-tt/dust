import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type {
  AgentConfigurationType,
  GlobalAgentContext,
} from "@app/types/assistant/agent";

/**
 * @cc [owner:tdraier,label:security;backend] pinned-run-configuration
 * Returns the full configuration of the exact version an agent message pinned (global agents: their
 * single version, shaped by `globalAgentContext`), or null when the caller cannot fetch it or cannot
 * view its content: a run MUST NOT proceed on redacted instructions or tools.
 */
export async function getPinnedAgentConfigurationForRun(
  auth: Authenticator,
  {
    agentId,
    agentVersion,
    globalAgentContext,
  }: {
    agentId: string;
    agentVersion: number;
    globalAgentContext?: GlobalAgentContext;
  }
): Promise<AgentConfigurationType | null> {
  const [agent] = await AgentResource.fetchByIdsAndVersions(
    auth,
    [{ agentId, agentVersion }],
    { globalAgentContext, withActions: true }
  );
  if (!agent?.canViewContent) {
    return null;
  }

  const [agentConfiguration] = await toAgentConfigurations(auth, [agent], {
    withFavorites: false,
    withTags: false,
  });
  return agentConfiguration ?? null;
}

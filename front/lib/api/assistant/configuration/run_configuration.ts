import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type {
  AgentConfigurationType,
  GlobalAgentContext,
} from "@app/types/assistant/agent";

type PinnedAgentVersion = {
  agentId: string;
  agentVersion: number;
  globalAgentContext?: GlobalAgentContext;
};

async function getPinnedAgentConfiguration(
  auth: Authenticator,
  { agentId, agentVersion, globalAgentContext }: PinnedAgentVersion,
  { withInstructions }: { withInstructions: boolean }
): Promise<AgentConfigurationType | null> {
  const [agent] = await AgentResource.fetchByIdsAndVersions(
    auth,
    [{ agentId, agentVersion }],
    { globalAgentContext, withActions: true }
  );

  if (!agent || !auth.can("read", agent)) {
    return null;
  }

  const [agentConfiguration] = await toAgentConfigurations(auth, [agent], {
    withInstructions,
    withFavorites: false,
    withTags: false,
  });
  return agentConfiguration ?? null;
}

/**
 * @cc [owner:tdraier,label:security;backend] pinned-run-configuration
 * Returns the full configuration of the exact version an agent message pinned (global agents: their
 * single version, shaped by `globalAgentContext`), or null when the caller cannot `read` it: a run
 * MUST NOT proceed for a caller without `read` (see `agent-verbs`), nor on redacted instructions or
 * tools.
 */
export async function getPinnedAgentConfigurationForRun(
  auth: Authenticator,
  pinned: PinnedAgentVersion
): Promise<AgentConfigurationType | null> {
  return getPinnedAgentConfiguration(auth, pinned, { withInstructions: true });
}

/**
 * @cc [owner:tdraier,label:security;performance] pinned-run-tooling
 * Returns the configuration `getPinnedAgentConfigurationForRun` returns, under the same `read` gate,
 * without loading its instructions (`instructions`/`instructionsHtml` are null): for callers that
 * resolve a run's tools and model without running it (the sandbox). It MUST NOT be used to run the
 * agent.
 */
export async function getPinnedAgentToolingForRun(
  auth: Authenticator,
  pinned: PinnedAgentVersion
): Promise<AgentConfigurationType | null> {
  return getPinnedAgentConfiguration(auth, pinned, { withInstructions: false });
}

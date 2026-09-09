import { pruneSuggestionsForAgent } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { AgentResource } from "@app/lib/resources/agent_resource";

export async function createOrUpgradeAgentConfiguration(
  args: Parameters<typeof AgentResource.createOrUpgradeAgentConfiguration>[0]
) {
  const result = await AgentResource.createOrUpgradeAgentConfiguration(args);
  if (result.isOk() && args.agentConfigurationId) {
    // Suggestions are pruned only after the complete new version is committed.
    await pruneSuggestionsForAgent(args.auth, result.value);
  }
  return result;
}

import type { DatasourceRetrievalData } from "@app/lib/api/assistant/observability/datasource_retrieval";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

export type PokeGetDatasourceRetrievalResponse = {
  datasources: DatasourceRetrievalData[];
  total: number;
};

// Poke reads any agent's full content, whatever the support caller's verbs on it (see
// `poke-agent-content-access`).
export async function getAgentConfigurationForPoke(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType | null> {
  const agent = await AgentResource.fetchById(auth, agentId, {
    dangerouslyViewContentForPoke: true,
  });
  if (!agent) {
    return null;
  }

  const [agentConfiguration] = await toAgentConfigurations(auth, [agent]);
  return agentConfiguration ?? null;
}

// Every version of an agent, newest first, with their full content (see
// `poke-agent-content-access`).
export async function listAgentConfigurationVersionsForPoke(
  auth: Authenticator,
  agentId: string
): Promise<AgentConfigurationType[]> {
  const agent = await AgentResource.fetchById(auth, agentId, {
    dangerouslyViewContentForPoke: true,
  });
  if (!agent) {
    return [];
  }

  return toAgentConfigurations(
    auth,
    await agent.listVersions(auth, { dangerouslyViewContentForPoke: true })
  );
}

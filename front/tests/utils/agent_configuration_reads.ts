import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import {
  toAgentConfigurations,
  toLightAgentConfigurations,
} from "@app/lib/resources/agent_resource_serialization";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";

// Test-only reads of agent configurations, serialized through `AgentResource` for the caller. They
// read the database, not the resource cache: tests update agent rows directly.

type LightVariant = "light" | "extra_light";

type ReadOptions = {
  dangerouslySkipPermissionFiltering?: boolean;
};

async function dropCachedAgents(
  auth: Authenticator,
  agentIds: string[]
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  await Promise.all(
    agentIds
      .filter((agentId) => !isGlobalAgentId(agentId))
      .map((agentId) => AgentResource.invalidateCache(workspaceId, agentId))
  );
}

async function serialize(
  auth: Authenticator,
  agents: AgentResource[],
  variant: LightVariant | "full"
): Promise<(AgentConfigurationType | LightAgentConfigurationType)[]> {
  if (variant === "full") {
    return toAgentConfigurations(auth, agents);
  }
  const isExtraLight = variant === "extra_light";
  return toLightAgentConfigurations(auth, agents, {
    withFavorites: !isExtraLight,
    withTags: !isExtraLight,
  });
}

export async function getAgentConfigurations(
  auth: Authenticator,
  args: { agentIds: string[]; variant: "full" } & ReadOptions
): Promise<AgentConfigurationType[]>;
export async function getAgentConfigurations(
  auth: Authenticator,
  args: { agentIds: string[]; variant: LightVariant } & ReadOptions
): Promise<LightAgentConfigurationType[]>;
export async function getAgentConfigurations(
  auth: Authenticator,
  {
    agentIds,
    variant,
    dangerouslySkipPermissionFiltering,
  }: { agentIds: string[]; variant: LightVariant | "full" } & ReadOptions
): Promise<(AgentConfigurationType | LightAgentConfigurationType)[]> {
  await dropCachedAgents(auth, agentIds);
  const agents = await AgentResource.fetchByIds(auth, agentIds, {
    dangerouslySkipFetchCheck: dangerouslySkipPermissionFiltering,
  });
  return serialize(auth, agents, variant);
}

export async function getAgentConfiguration(
  auth: Authenticator,
  args: {
    agentId: string;
    agentVersion?: number;
    variant: "full";
  } & ReadOptions
): Promise<AgentConfigurationType | null>;
export async function getAgentConfiguration(
  auth: Authenticator,
  args: {
    agentId: string;
    agentVersion?: number;
    variant: LightVariant;
  } & ReadOptions
): Promise<LightAgentConfigurationType | null>;
export async function getAgentConfiguration(
  auth: Authenticator,
  {
    agentId,
    agentVersion,
    variant,
    dangerouslySkipPermissionFiltering,
  }: {
    agentId: string;
    agentVersion?: number;
    variant: LightVariant | "full";
  } & ReadOptions
): Promise<AgentConfigurationType | LightAgentConfigurationType | null> {
  const options = {
    dangerouslySkipFetchCheck: dangerouslySkipPermissionFiltering,
  };
  await dropCachedAgents(auth, [agentId]);
  const agents =
    agentVersion === undefined
      ? await AgentResource.fetchByIds(auth, [agentId], options)
      : await AgentResource.fetchByIdsAndVersions(
          auth,
          [{ agentId, agentVersion }],
          options
        );
  const [configuration] = await serialize(auth, agents, variant);
  return configuration ?? null;
}

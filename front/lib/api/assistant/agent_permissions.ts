import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";

function sameIds<T extends ModelId | string>(left: T[], right: T[]): boolean {
  return (
    left.length === right.length &&
    left.every((agentId, index) => agentId === right[index])
  );
}

export async function shadowCanAdminAgent(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  legacy: boolean,
  callSite: string
): Promise<boolean> {
  return shadowCompare({
    auth,
    legacy,
    candidate: async () => {
      const resource = await AgentResource.fetchByAgentConfiguration(
        auth,
        agent
      );
      return auth.can("admin", resource);
    },
    context: {
      check: "agent_permission",
      callSite,
      verb: "admin",
      agentId: agent.sId,
      agentConfigurationModelId: agent.id,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
  });
}

export async function shadowEditableAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  legacy: LightAgentConfigurationType[],
  callSite: string
): Promise<LightAgentConfigurationType[]> {
  await shadowCompare({
    auth,
    legacy: legacy.map((agent) => agent.sId).sort(),
    candidate: async () => {
      const customAgents = agents.filter((agent) => agent.scope !== "global");
      const resources = await AgentResource.fetchByAgentConfigurations(
        auth,
        customAgents
      );

      return resources
        .filter((resource) => auth.isAdmin() || auth.can("write", resource))
        .map((resource) => resource.sId)
        .sort();
    },
    context: {
      check: "editable_agents",
      callSite,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: sameIds,
  });

  return legacy;
}

export async function shadowUsageConfigIds(
  auth: Authenticator,
  legacyModelIds: ModelId[],
  callSite: string
): Promise<ModelId[]> {
  return shadowCompare({
    auth,
    legacy: [...legacyModelIds].sort((a, b) => a - b),
    candidate: async () =>
      (await AgentResource.listEditorConfigModelIds(auth)).sort(
        (a, b) => a - b
      ),
    context: {
      check: "agent_usage_filter",
      callSite,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: sameIds,
  });
}

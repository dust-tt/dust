import { areAgentGrantsEnabled } from "@app/lib/api/assistant/agent_grants";
import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";

function sameIds<T extends ModelId | string>(left: T[], right: T[]): boolean {
  return (
    left.length === right.length &&
    left.every((agentId, index) => agentId === right[index])
  );
}

export async function canAdminAgent(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  legacy: () => Promise<boolean>,
  callSite: string
): Promise<boolean> {
  const candidate = async () => {
    const resource = await AgentResource.fetchByAgentConfiguration(auth, agent);
    return auth.can("admin", resource);
  };
  if (await areAgentGrantsEnabled(auth)) {
    return candidate();
  }
  return shadowCompare({
    auth,
    legacy: await legacy(),
    candidate,
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

export async function filterEditableAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  legacy: LightAgentConfigurationType[],
  callSite: string
): Promise<LightAgentConfigurationType[]> {
  const candidate = async () => {
    const customAgents = agents.filter((agent) => agent.scope !== "global");
    const resources = await AgentResource.fetchByAgentConfigurations(
      auth,
      customAgents
    );
    return resources
      .filter((resource) => auth.isAdmin() || auth.can("write", resource))
      .map((resource) => resource.sId)
      .sort();
  };
  if (await areAgentGrantsEnabled(auth)) {
    const editableIds = new Set(await candidate());
    return agents.filter((agent) => editableIds.has(agent.sId));
  }
  await shadowCompare({
    auth,
    legacy: legacy.map((agent) => agent.sId).sort(),
    candidate,
    context: {
      check: "editable_agents",
      callSite,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: sameIds,
  });

  return legacy;
}

export async function listAgentUsageConfigIds(
  auth: Authenticator,
  callSite: string
): Promise<ModelId[]> {
  if (await areAgentGrantsEnabled(auth)) {
    return AgentResource.listEditorConfigModelIds(auth);
  }
  const groups = await GroupResource.findAgentIdsForGroups(
    auth,
    auth.groupModelIds()
  );
  const legacyModelIds = groups.map((group) => group.agentConfigurationId);
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

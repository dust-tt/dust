import { isLegacyAclsEnabled } from "@app/lib/api/permissions/legacy_acls";
import {
  hasActiveConfigurations,
  shadowCompare,
} from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import xor from "lodash/xor";

function sameIds<T extends ModelId | string>(left: T[], right: T[]): boolean {
  return (
    left.length === right.length &&
    left.every((agentId, index) => agentId === right[index])
  );
}

export async function shadowCanAdminAgent(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  legacy: () => Promise<boolean>,
  callSite: string
): Promise<boolean> {
  const candidate = async () => {
    const resource = AgentResource.fromAgentConfiguration(auth, agent);
    return auth.can("admin", resource);
  };
  const useGrants = !isLegacyAclsEnabled();
  return shadowCompare({
    auth,
    legacy: useGrants ? await candidate() : await legacy(),
    candidate: useGrants ? legacy : candidate,
    reverse: useGrants,
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
  const candidate = async () => {
    const customAgents = agents.filter((agent) => agent.scope !== "global");
    const resources = AgentResource.fromAgentConfigurations(
      auth,
      customAgents
    );
    return resources
      .filter((resource) => auth.isAdmin() || auth.can("write", resource))
      .map((resource) => resource.sId)
      .sort();
  };
  const useGrants = !isLegacyAclsEnabled();
  const legacyIds = async () => {
    if (!useGrants) {
      return legacy.map((agent) => agent.sId).sort();
    }
    const groups = auth.user()
      ? await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())
      : [];
    const editorIds = new Set(
      groups.map((group) => group.agentConfigurationId)
    );
    return agents
      .filter(
        (agent) =>
          auth.isAdmin() ||
          agent.versionAuthorId === auth.user()?.id ||
          editorIds.has(agent.id) ||
          (!auth.user() && agent.canEdit)
      )
      .map((agent) => agent.sId)
      .sort();
  };
  const selectedIds = await shadowCompare({
    auth,
    legacy: useGrants ? await candidate() : await legacyIds(),
    candidate: useGrants ? legacyIds : candidate,
    reverse: useGrants,
    context: {
      check: "editable_agents",
      callSite,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: sameIds,
  });

  const editableIds = new Set(selectedIds);
  return useGrants
    ? agents.filter((agent) => editableIds.has(agent.sId))
    : legacy;
}

/**
 * @cc [owner:philipperolet,label:permissions] active-usage-shadow
 * Usage shadow checks must ignore differences outside active workspace configurations, without
 * changing the legacy IDs returned to callers.
 */
export async function shadowUsageConfigIds(
  auth: Authenticator,
  callSite: string
): Promise<ModelId[]> {
  const useGrants = !isLegacyAclsEnabled();
  const legacy = async () => {
    const groups = await GroupResource.findAgentIdsForGroups(
      auth,
      auth.groupModelIds()
    );
    return groups
      .map((group) => group.agentConfigurationId)
      .sort((a, b) => a - b);
  };
  const candidate = async () =>
    (await AgentResource.listEditorConfigModelIds(auth)).sort((a, b) => a - b);
  return shadowCompare({
    auth,
    legacy: useGrants ? await candidate() : await legacy(),
    candidate: useGrants ? legacy : candidate,
    reverse: useGrants,
    context: {
      check: "agent_usage_filter",
      callSite,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    // Usage queries only read active configurations; historical editor links do not affect them.
    equals: async (legacy, candidate) =>
      !(await hasActiveConfigurations(auth, xor(legacy, candidate))),
  });
}

import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";

function sortedUserModelIds(users: { id: number }[]): number[] {
  return [...new Set(users.map((user) => user.id))].sort((a, b) => a - b);
}

function sameModelIds(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    left.every((modelId, index) => modelId === right[index])
  );
}

export async function getAgentEditorsShadowed(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  legacyEditors: UserResource[],
  callSite: string
): Promise<UserResource[]> {
  await shadowCompare({
    auth,
    legacy: sortedUserModelIds(legacyEditors),
    candidate: async () => {
      const resource = await AgentResource.fetchByAgentConfiguration(
        auth,
        agentConfiguration
      );
      const editors = await resource.listEditors(auth);
      assert(editors !== null);
      return sortedUserModelIds(editors);
    },
    context: {
      check: "agent_editors",
      callSite,
      agentId: agentConfiguration.sId,
      agentConfigurationModelId: agentConfiguration.id,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: sameModelIds,
  });

  return legacyEditors;
}

export const getAuthors = async (
  agentConfigurations: LightAgentConfigurationType[]
): Promise<UserType[]> => {
  const authorIds = new Set(
    removeNulls(agentConfigurations.map((a) => a.versionAuthorId))
  );
  const authors = await UserResource.fetchByModelIds(Array.from(authorIds));
  return authors.map((a) => a.toJSON());
};

export const getEditors = async (
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<UserType[]> => {
  const editorGroupRes = await GroupResource.findEditorGroupForAgent(
    auth,
    agentConfiguration
  );
  if (editorGroupRes.isErr()) {
    // We could do better here but this is not a critical path.
    await getAgentEditorsShadowed(auth, agentConfiguration, [], "getEditors");
    return [];
  }

  const editorGroup = editorGroupRes.value;
  const members = await getAgentEditorsShadowed(
    auth,
    agentConfiguration,
    await editorGroup.getActiveMembers(auth),
    "getEditors"
  );
  const memberUsers = members.map((m) => m.toJSON());
  return memberUsers;
};

async function shadowAgentEditorsBatch(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  legacyEditors: Record<string, UserType[]>
): Promise<void> {
  const customAgents = agents.filter((agent) => agent.scope !== "global");
  const normalizedLegacyEditors = customAgents
    .map(
      (agent) =>
        [agent.sId, sortedUserModelIds(legacyEditors[agent.sId] ?? [])] as const
    )
    .sort(([left], [right]) => left.localeCompare(right));

  await shadowCompare({
    auth,
    legacy: normalizedLegacyEditors,
    candidate: async () => {
      const resources = await AgentResource.fetchByAgentConfigurations(
        auth,
        customAgents
      );
      const editorsByAgentId = await AgentResource.batchListEditors(
        auth,
        resources
      );

      const normalizedCandidateEditors = customAgents
        .map(
          (agent) =>
            [
              agent.sId,
              sortedUserModelIds(editorsByAgentId.get(agent.sId) ?? []),
            ] as const
        )
        .sort(([left], [right]) => left.localeCompare(right));

      return normalizedCandidateEditors;
    },
    context: {
      check: "agent_editors_batch",
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    equals: (legacy, candidate) =>
      legacy.length === candidate.length &&
      legacy.every(
        ([agentId, editorModelIds], index) =>
          agentId === candidate[index][0] &&
          sameModelIds(editorModelIds, candidate[index][1])
      ),
  });
}

/**
 * @cc [owner:philipperolet,label:product] active-agent-editors
 * Returned editors must have active membership in the workspace and their agent's editor group.
 */
export const getAgentsEditors = async (
  auth: Authenticator,
  agentConfigurations: LightAgentConfigurationType[]
): Promise<Record<string, UserType[]>> => {
  const editorGroups = await GroupResource.findEditorGroupsForAgents(
    auth,
    agentConfigurations
  );
  const result: Record<string, UserType[]> = {};
  if (editorGroups.isOk()) {
    const activeMemberships = await GroupResource.getActiveMembershipsForGroups(
      auth,
      Object.values(editorGroups.value)
    );
    const users = await UserResource.fetchByModelIds([
      ...new Set(Object.values(activeMemberships).flat()),
    ]);
    // Batch lookup uses the memberships (workspaceId, userId, startAt, endAt) index.
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace: auth.getNonNullableWorkspace(),
    });
    const activeUserModelIds = new Set(
      memberships.map((membership) => membership.userId)
    );
    // Create a map from userId to UserType for quick lookup
    const userMap = new Map(
      users
        .filter((user) => activeUserModelIds.has(user.id))
        .map((user) => [user.id, user.toJSON()])
    );

    // Build the result map: { agentId: [editors] }
    for (const [agentId, group] of Object.entries(editorGroups.value)) {
      const userModelIds = activeMemberships[group.id] ?? [];
      result[agentId] = removeNulls(
        userModelIds.map((userModelId) => userMap.get(userModelId))
      );
    }
  }

  await shadowAgentEditorsBatch(auth, agentConfigurations, result);

  return result;
};

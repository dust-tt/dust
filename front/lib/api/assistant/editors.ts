import { areAgentGrantsEnabled } from "@app/lib/api/assistant/agent_grants";
import { shadowCompare } from "@app/lib/api/permissions/shadow";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
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

async function shadowAgentEditors(
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

export async function getAgentEditors(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  callSite: string
): Promise<
  Result<
    UserResource[],
    DustError<
      "group_not_found" | "internal_error" | "unauthorized" | "invalid_id"
    >
  >
> {
  if (
    agentConfiguration.scope !== "global" &&
    (await areAgentGrantsEnabled(auth))
  ) {
    const resource = await AgentResource.fetchByAgentConfiguration(
      auth,
      agentConfiguration
    );
    const editors = await resource.listEditors(auth);
    assert(editors !== null);
    return new Ok(editors);
  }
  const editorGroupRes = await GroupResource.findEditorGroupForAgent(
    auth,
    agentConfiguration
  );
  if (editorGroupRes.isErr()) {
    await shadowAgentEditors(auth, agentConfiguration, [], callSite);
    return editorGroupRes;
  }
  const editors = await shadowAgentEditors(
    auth,
    agentConfiguration,
    await editorGroupRes.value.getActiveMembers(auth),
    callSite
  );
  return new Ok(editors);
}

export const getEditors = async (
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<UserType[]> => {
  const editors = await getAgentEditors(auth, agentConfiguration, "getEditors");
  if (editors.isErr()) {
    // We could do better here but this is not a critical path.
    return [];
  }
  return editors.value.map((editor) => editor.toJSON());
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

export const getAgentsEditors = async (
  auth: Authenticator,
  agentConfigurations: LightAgentConfigurationType[]
): Promise<Record<string, UserType[]>> => {
  if (await areAgentGrantsEnabled(auth)) {
    const resources = await AgentResource.fetchByAgentConfigurations(
      auth,
      agentConfigurations.filter((agent) => agent.scope !== "global")
    );
    const editorsByAgentId = await AgentResource.batchListEditors(
      auth,
      resources
    );
    return Object.fromEntries(
      [...editorsByAgentId].map(([agentId, editors]) => {
        assert(editors !== null);
        return [agentId, editors.map((editor) => editor.toJSON())];
      })
    );
  }
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
    // Create a map from userId to UserType for quick lookup
    const userMap = new Map(users.map((user) => [user.id, user.toJSON()]));

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

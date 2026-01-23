import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType, UserType } from "@app/types";
import { removeNulls } from "@app/types";

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
    return [];
  }

  const editorGroup = editorGroupRes.value;
  const members = await editorGroup.getActiveMembers(auth);
  const memberUsers = members.map((m) => m.toJSON());
  return memberUsers;
};

export const getAgentsEditors = async (
  auth: Authenticator,
  agentConfigurations: LightAgentConfigurationType[]
): Promise<Record<string, UserType[]>> => {
  const editorGroups = await GroupResource.findEditorGroupsForAgents(
    auth,
    agentConfigurations
  );
  if (editorGroups.isErr()) {
    return {};
  }

  const activeMemberships = await GroupResource.getActiveMembershipsForGroups(
    auth,
    Object.values(editorGroups.value)
  );

  const users = await UserResource.fetchByModelIds([
    ...new Set(Object.values(activeMemberships).flat()),
  ]);

  // Create a map from userId to UserType for quick lookup
  const userMap = new Map(users.map((u) => [u.id, u.toJSON()]));

  // Build the result map: { agentId: [editors] }
  const result: Record<string, UserType[]> = {};
  for (const [agentId, group] of Object.entries(editorGroups.value)) {
    const userIds = activeMemberships[group.id] || [];
    result[agentId] = removeNulls(userIds.map((userId) => userMap.get(userId)));
  }

  return result;
};

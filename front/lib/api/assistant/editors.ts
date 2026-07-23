import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";

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
  const editorUsers = await GroupResource.listAgentEditorUsers(
    auth,
    agentConfigurations
  );
  if (editorUsers.isErr()) {
    return {};
  }

  // Build the result map: { agentId: [editors] }
  const result: Record<string, UserType[]> = {};
  for (const [agentId, users] of Object.entries(editorUsers.value)) {
    result[agentId] = users.map((user) => user.toJSON());
  }

  return result;
};

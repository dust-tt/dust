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

export const getEditorsByAgents = async (
  auth: Authenticator,
  agentConfigurations: LightAgentConfigurationType[]
): Promise<Record<string, UserType[]>> => {
  const editors = await Promise.all(
    agentConfigurations.map((agentConfiguration) =>
      getEditors(auth, agentConfiguration)
    )
  );

  // Return a map { agentId: [editors] }
  return editors.reduce(
    (acc, editor, index) => {
      acc[agentConfigurations[index].sId] = editor;
      return acc;
    },
    {} as Record<string, UserType[]>
  );
};

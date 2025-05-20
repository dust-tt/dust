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

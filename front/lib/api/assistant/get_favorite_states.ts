import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";

export async function getFavoriteStates(
  auth: Authenticator,
  {
    configurationIds,
  }: {
    configurationIds: string[];
  }
): Promise<Map<string, boolean>> {
  return AgentUserRelationResource.getFavoriteStates(auth, {
    configurationIds,
  });
}

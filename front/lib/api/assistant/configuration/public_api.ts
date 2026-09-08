import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

/**
 * @cc [owner:aubin-tchoi,label:api] api-key-agent-edit-permissions
 * API-key responses report `canEdit` according to the PATCH role, scope, status, and requested-space
 * gates; user-authenticated responses retain their editor permissions.
 */
export async function serializeAgentConfigurationsForPublicApi<
  T extends LightAgentConfigurationType,
>(auth: Authenticator, agents: T[]): Promise<T[]> {
  if (!auth.isKey()) {
    return agents;
  }

  const spaces = auth.isBuilder()
    ? await SpaceResource.fetchByIds(auth, [
        ...new Set(agents.flatMap((agent) => agent.requestedSpaceIds)),
      ])
    : [];
  const spaceById = new Map(spaces.map((space) => [space.sId, space]));

  return agents.map((agent) => ({
    ...agent,
    canEdit:
      auth.isBuilder() &&
      agent.scope !== "global" &&
      agent.status === "active" &&
      (agent.canRead || auth.isAdmin()) &&
      agent.requestedSpaceIds.every((spaceId) => {
        const space = spaceById.get(spaceId);
        return space !== undefined && auth.can("read", space);
      }),
  }));
}

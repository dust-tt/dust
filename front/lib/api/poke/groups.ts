import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { GroupType } from "@app/types/groups";
import type { UserTypeWithWorkspaces } from "@app/types/user";

export type PokeListGroups = {
  groups: GroupType[];
};

export type PokeGetGroupDetails = {
  members: UserTypeWithWorkspaces[];
  group: GroupType;
};

// Resolve a group by sId for Poke, regardless of kind.
//
// `GroupResource.fetchById` deliberately does not surface the internal kinds (`regular_auto`
// groups backing a space's members/editors, `system`, `agent_editors`) — outside Poke those are
// reached from the resource they back. Poke is the exception: its group permissions tables list
// grants of every kind and link each group name to its group page, so that page (and the
// grants-by-group endpoint behind it) must resolve any group id an operator arrives with.
export async function fetchPokeGroupById(
  auth: Authenticator,
  id: string
): Promise<GroupResource | null> {
  const modelId = getResourceIdFromSId(id);
  if (modelId === null) {
    return null;
  }

  const [group] = await GroupResource.dangerouslyFetchByModelIds(auth, [
    modelId,
  ]);

  return group ?? null;
}

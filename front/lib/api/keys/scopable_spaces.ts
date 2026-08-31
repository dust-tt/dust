import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The spaces a new API key may be scoped to: the workspace's restricted spaces — both regular
 * (spaces) and project (pods).
 *
 * A key's groups are derived from the spaces it is scoped to, so scoping is expressed in spaces
 * rather than in groups. Open spaces are readable through the workspace global group that every key
 * carries, so they are not meaningful to scope to.
 */
export async function listKeyScopableSpaces(
  auth: Authenticator
): Promise<SpaceResource[]> {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
    includeOpen: false,
  });

  // `includeOpen: false` leaves the non-scopable unique kinds (system, global) in the result;
  // narrow to the regular/project spaces we actually care about.
  return spaces.filter((space) => space.isRegular() || space.isProject());
}

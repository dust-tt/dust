import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";

/**
 * The spaces a new API key may be scoped to: the workspace's regular spaces and pods, open or
 * restricted, plus the global space (Company Data).
 *
 * A key's groups are derived from the spaces it is scoped to, so scoping is expressed in spaces
 * rather than in groups. Every key already reads open spaces and the global space through the
 * workspace global group; scoping a key to one of them additionally grants it write (uploading
 * files, say) through the space's member group.
 */
/**
 * @cc [owner:fabiencelier,label:product;security] scopable-space-kinds
 * The result MUST contain only `regular`, `project` and `global` spaces of the workspace; the
 * `system` and `conversations` spaces MUST never be listed.
 */
export async function listKeyScopableSpaces(
  auth: Authenticator
): Promise<SpaceResource[]> {
  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });

  return spaces.filter(
    (space) => space.isRegular() || space.isProject() || space.isGlobal()
  );
}

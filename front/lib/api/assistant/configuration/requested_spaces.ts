import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";

/**
 * @cc [owner:rfrenoy,label:security;product] requested-spaces-readable-by-caller
 * Unless `dangerouslySkipPermissionFiltering` is set, the call MUST return an `Err` naming every
 * offending space when any of `capabilitySpaceModelIds` or `requestedSpaceIds` is not readable by
 * `auth` (`auth.can("read", space)`). A space that cannot be fetched, including a malformed sId,
 * counts as not readable. A `requestedSpaceIds` entry MUST only be accepted when it equals the
 * canonical sId of a fetched space, so an id carrying another resource prefix or another
 * workspace cannot alias a space of this workspace. The `Ok` value MUST only contain spaces that
 * exist.
 */
export async function resolveAgentRequestedSpaceModelIds(
  auth: Authenticator,
  {
    capabilitySpaceModelIds,
    requestedSpaceIds,
    dangerouslySkipPermissionFiltering,
  }: {
    capabilitySpaceModelIds: ModelId[];
    requestedSpaceIds: string[];
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<Result<ModelId[], Error>> {
  const spaceIds = uniq(requestedSpaceIds);
  const [capabilitySpaces, spaces] = await Promise.all([
    SpaceResource.fetchByModelIds(auth, capabilitySpaceModelIds),
    SpaceResource.fetchByIds(auth, spaceIds),
  ]);

  if (!dangerouslySkipPermissionFiltering) {
    const owner = auth.getNonNullableWorkspace();
    const readableCapabilitySpaceModelIds = new Set(
      capabilitySpaces
        .filter((space) => auth.can("read", space))
        .map((space) => space.id)
    );
    const readableSpaceIds = new Set(
      spaces
        .filter((space) => auth.can("read", space))
        .map((space) => space.sId)
    );
    const inaccessibleSpaceIds = uniq([
      ...capabilitySpaceModelIds
        .filter((id) => !readableCapabilitySpaceModelIds.has(id))
        .map((id) => SpaceResource.modelIdToSId({ id, workspaceId: owner.id })),
      ...spaceIds.filter((spaceId) => !readableSpaceIds.has(spaceId)),
    ]);
    if (inaccessibleSpaceIds.length > 0) {
      return new Err(
        new Error(
          `User does not have access to the following spaces: ${inaccessibleSpaceIds.join(", ")}`
        )
      );
    }
  }

  return new Ok(
    uniq([...capabilitySpaces, ...spaces].map((space) => space.id))
  );
}

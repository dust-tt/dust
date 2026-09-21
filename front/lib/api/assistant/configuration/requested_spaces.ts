import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";

/**
 * @cc [owner:rfrenoy,label:security;product] requested-spaces-readable-by-caller
 * Unless `dangerouslySkipPermissionFiltering` is set, the call MUST return an `Err` naming every
 * offending space when any of `capabilitySpaces` or `requestedSpaceIds` is not readable by `auth`
 * (`auth.can("read", space)`). Whether or not the bypass is set, a `requestedSpaceIds` entry MUST
 * only resolve to a space whose canonical sId equals it, so a missing or malformed id, or an id
 * carrying another resource prefix or another workspace, never aliases a space of this workspace:
 * without the bypass it counts as not readable, with the bypass it is dropped. The `Ok` value MUST
 * only contain spaces that exist.
 */
export async function resolveAgentRequestedSpaces(
  auth: Authenticator,
  {
    capabilitySpaces,
    requestedSpaceIds,
    dangerouslySkipPermissionFiltering,
  }: {
    capabilitySpaces: SpaceResource[];
    requestedSpaceIds: string[];
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<Result<SpaceResource[], Error>> {
  const spaceIds = new Set(requestedSpaceIds);
  const spaces = (await SpaceResource.fetchByIds(auth, [...spaceIds])).filter(
    (space) => spaceIds.has(space.sId)
  );

  if (!dangerouslySkipPermissionFiltering) {
    const readableSpaceIds = new Set(
      spaces
        .filter((space) => auth.can("read", space))
        .map((space) => space.sId)
    );
    const inaccessibleSpaceIds = uniq([
      ...capabilitySpaces
        .filter((space) => !auth.can("read", space))
        .map((space) => space.sId),
      ...[...spaceIds].filter((spaceId) => !readableSpaceIds.has(spaceId)),
    ]);
    if (inaccessibleSpaceIds.length > 0) {
      return new Err(
        new Error(
          `User does not have access to the following spaces: ${inaccessibleSpaceIds.join(", ")}`
        )
      );
    }
  }

  return new Ok(uniqBy([...capabilitySpaces, ...spaces], (space) => space.id));
}

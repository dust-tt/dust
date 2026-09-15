import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * Whether the caller can read every one of `requestedSpaceIds` (a conjunctive check), using a
 * pre-fetched `spaceId -> SpaceResource` map so callers resolve the spaces once and reuse them
 * across many items.
 *
 * Space access is served from `group_permissions` via `auth.can` (which also honors the
 * `use_legacy_acls` kill switch). A requested space missing from the map — deleted, or belonging to
 * another workspace — is treated as not readable.
 */
export function canReadRequestedSpaces(
  auth: Authenticator,
  spaceById: Map<ModelId, SpaceResource>,
  requestedSpaceIds: ModelId[]
): boolean {
  return requestedSpaceIds.every((spaceId) => {
    const space = spaceById.get(spaceId);
    return space ? auth.can("read", space) : false;
  });
}

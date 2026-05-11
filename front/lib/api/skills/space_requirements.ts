import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";

export async function resolveAdditionalRequestedSpaceModelIds(
  auth: Authenticator,
  additionalRequestedSpaceIds: string[] | undefined
): Promise<Result<ModelId[], Error>> {
  const requestedSpaceIds = uniq(additionalRequestedSpaceIds ?? []);

  if (requestedSpaceIds.length === 0) {
    return new Ok([]);
  }

  const spaces = await SpaceResource.fetchByIds(auth, requestedSpaceIds);
  const readableSpacesById = new Map(
    spaces
      .filter((space) => space.canRead(auth))
      .map((space) => [space.sId, space])
  );

  const inaccessibleSpaceIds = requestedSpaceIds.filter(
    (spaceId) => !readableSpacesById.has(spaceId)
  );

  if (inaccessibleSpaceIds.length > 0) {
    return new Err(
      new Error(
        `User does not have access to the following spaces: ${inaccessibleSpaceIds.join(", ")}`
      )
    );
  }

  const additionalRequestedSpaceModelIds: ModelId[] = [];
  for (const spaceId of requestedSpaceIds) {
    const space = readableSpacesById.get(spaceId);
    if (space) {
      additionalRequestedSpaceModelIds.push(space.id);
    }
  }

  return new Ok(additionalRequestedSpaceModelIds);
}

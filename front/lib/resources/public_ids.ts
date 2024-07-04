import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import Sqids from "sqids";

import logger from "@app/logger/logger";

const RESOURCE_PUBLIC_ID_MIN_LENGTH = 10;

const sqids = new Sqids({
  minLength: RESOURCE_PUBLIC_ID_MIN_LENGTH,
});

// Static shard key until we implement sharding.
const SHARD_KEY = 1;

const RESOURCES_PREFIX = {
  file: "fil",
};

const ALL_RESOURCES_PREFIXES = Object.values(RESOURCES_PREFIX);

type ResourceNameType = keyof typeof RESOURCES_PREFIX;

export function makePublicId(
  resourceName: ResourceNameType,
  {
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }
): string {
  const idsToEncode = [
    // First encode shard key.
    SHARD_KEY,
    // Then encode the workspace Id.
    workspaceId,
    // Finally encode the resource Id.
    id,
  ];

  return `${RESOURCES_PREFIX[resourceName]}_${sqids.encode(idsToEncode)}`;
}

function getIdsFromPublicId(
  publicId: string
): Result<[number, ModelId, ModelId], Error> {
  const [resourcePrefix, publicIdWithoutPrefix] = publicId.split("_");

  if (!ALL_RESOURCES_PREFIXES.includes(resourcePrefix)) {
    return new Err(new Error("Invalid resource prefix in public Id"));
  }

  if (publicIdWithoutPrefix.length < RESOURCE_PUBLIC_ID_MIN_LENGTH) {
    return new Err(new Error("Invalid public Id length"));
  }

  try {
    const ids = sqids.decode(publicIdWithoutPrefix);

    if (ids.length !== 3) {
      return new Err(new Error("Invalid decoded public Id length"));
    }

    return new Ok([ids[0], ids[1], ids[2]]);
  } catch (error) {
    return new Err(
      error instanceof Error ? error : new Error("Failed to decode public Id")
    );
  }
}

export function getResourceIdFromPublicId(publicId: string): ModelId | null {
  const publicIdsRes = getIdsFromPublicId(publicId);
  if (publicIdsRes.isErr()) {
    logger.error(
      { publicId, error: publicIdsRes.error },
      "Failed to get IDs from public Id"
    );

    return null;
  }

  return publicIdsRes.value[2];
}

import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import Sqids from "sqids";

import logger from "@app/logger/logger";

const RESOURCE_S_ID_MIN_LENGTH = 10;

const sqids = new Sqids({
  minLength: RESOURCE_S_ID_MIN_LENGTH,
});

// Static shard key until we implement sharding.
const SHARD_KEY = 1;

// Static region for now.
const REGION = 1; // US.

const RESOURCES_PREFIX = {
  file: "fil",
};

const ALL_RESOURCES_PREFIXES = Object.values(RESOURCES_PREFIX);

type ResourceNameType = keyof typeof RESOURCES_PREFIX;

export function makeSId(
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
    // First code the region.
    REGION,
    // Then encode the shard key.
    SHARD_KEY,
    // Then encode the workspace Id.
    workspaceId,
    // Finally encode the resource Id.
    id,
  ];

  return `${RESOURCES_PREFIX[resourceName]}_${sqids.encode(idsToEncode)}`;
}

function getIdsFromSId(sId: string): Result<
  {
    region: number;
    shardKey: number;
    workspaceId: ModelId;
    resourceId: ModelId;
  },
  Error
> {
  const [resourcePrefix, sIdWithoutPrefix] = sId.split("_");

  if (!ALL_RESOURCES_PREFIXES.includes(resourcePrefix)) {
    return new Err(new Error("Invalid resource prefix in string Id"));
  }

  if (sIdWithoutPrefix.length < RESOURCE_S_ID_MIN_LENGTH) {
    return new Err(new Error("Invalid string Id length"));
  }

  try {
    const ids = sqids.decode(sIdWithoutPrefix);

    if (ids.length !== 4) {
      return new Err(new Error("Invalid decoded string Id length"));
    }

    const [region, shardKey, workspaceId, resourceId] = ids;

    return new Ok({ region, shardKey, workspaceId, resourceId });
  } catch (error) {
    return new Err(
      error instanceof Error ? error : new Error("Failed to decode string Id")
    );
  }
}

export function getResourceIdFromSId(sId: string): ModelId | null {
  const sIdsRes = getIdsFromSId(sId);
  if (sIdsRes.isErr()) {
    logger.error(
      { sId, error: sIdsRes.error },
      "Failed to get IDs from string Id"
    );

    return null;
  }

  return sIdsRes.value.resourceId;
}

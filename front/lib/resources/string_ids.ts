import { hash as blake3 } from "blake3";
import Sqids from "sqids";
import { v4 as uuidv4 } from "uuid";

import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

const RESOURCE_S_ID_MIN_LENGTH = 10;

const sqids = new Sqids({
  minLength: RESOURCE_S_ID_MIN_LENGTH,
});

// WARNING: These legacy bits are part of the ID encoding scheme and must be preserved to maintain
// backwards compatibility with existing string IDs.
// They were originally used for sharding and region information but are no longer functionally
// needed after migration to cross-region architecture.
const LEGACY_SHARD_BIT = 1;
const LEGACY_REGION_BIT = 1; // Previously indicated US region.

const RESOURCES_PREFIX = {
  file: "fil",
  group: "grp",
  // TODO(2024-10-31 flav) Add new prefix for space.
  space: "vlt",
  data_source: "dts",
  data_source_view: "dsv",
  tracker: "trk",
  template: "tpl",
  extension: "ext",
  mcp_server_connection: "msc",
  remote_mcp_server: "rms",
  internal_mcp_server: "ims",
  mcp_server_view: "msv",
  data_source_configuration: "dsc",
};

export const CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID: ModelId = 0;

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
  const idsToEncode = [LEGACY_REGION_BIT, LEGACY_SHARD_BIT, workspaceId, id];

  return `${RESOURCES_PREFIX[resourceName]}_${sqids.encode(idsToEncode)}`;
}

function getIdsFromSId(sId: string): Result<
  {
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

    const [, , workspaceId, resourceId] = ids;

    return new Ok({ workspaceId, resourceId });
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

export function isResourceSId(
  resourceName: ResourceNameType,
  sId: string
): boolean {
  return sId.startsWith(`${RESOURCES_PREFIX[resourceName]}_`);
}

export function getResourceNameAndIdFromSId(sId: string): {
  resourceName: ResourceNameType;
  sId: string;
  workspaceId: ModelId;
  resourceId: ModelId;
} | null {
  const resourceName = (
    Object.keys(RESOURCES_PREFIX) as ResourceNameType[]
  ).find((name) => isResourceSId(name, sId));

  if (!resourceName) {
    return null;
  }

  const sIdRes = getIdsFromSId(sId);
  // Silently ignore errors.
  if (sIdRes.isErr()) {
    return null;
  }

  return { resourceName, sId, ...sIdRes.value };
}

// Legacy behavior.

/**
 * Generates 10-character long model SId from [A-Za-z0-9] characters.
 */
export function generateRandomModelSId(prefix?: string): string {
  const u = uuidv4();
  const b = blake3(u, { length: 10 });
  const sId = Buffer.from(b)
    .map(uniformByteToCode62)
    .map(alphanumFromCode62)
    .toString();

  if (prefix) {
    return `${prefix}_${sId}`;
  }

  return sId;
}

/**
 * Given a code in between 0 and 61 included, returns the corresponding
 * character from [A-Za-z0-9]
 */
function alphanumFromCode62(code: number) {
  const CHAR_A = 65;
  const CHAR_a = 97;
  const CHAR_0 = 48;

  if (code < 26) {
    return CHAR_A + code;
  }

  if (code < 52) {
    return CHAR_a + code - 26;
  }

  if (code < 62) {
    return CHAR_0 + code - 52;
  }

  throw new Error("Invalid code");
}

/**
 * Given a byte, returns a code in between 0 and 61 included with a uniform
 * distribution guarantee, i.e. if the byte is uniformly drawn over 0-255, the
 * code will be uniformly drawn over 0-61.
 *
 * This is achieved by taking a modulo of 64 instead of 62, so the modulo is unbiased.
 * Then, if the result is 62 or 63, we draw a random number in [0, 61].
 */
function uniformByteToCode62(byte: number): number {
  const res = byte % 64;
  return res < 62 ? res : Math.floor(Math.random() * 62);
}

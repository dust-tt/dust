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
export const LEGACY_REGION_BIT = 1; // Previously indicated US region.
const LEGACY_SHARD_BIT = 1;

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
  mcp_server_view: "msv",
  remote_mcp_server: "rms",
  tag: "tag",
  transcripts_configuration: "tsc",
  agent_step_content: "asc",
  agent_memory: "amm",

  // Resource relative to triggers.
  trigger: "trg",
  webhook_source: "whs",
  webhook_sources_view: "wsv",

  // Action (used for tool approval currently).
  mcp_action: "act",

  // Resources relative to the configuration of an MCP server.
  data_source_configuration: "dsc",
  table_configuration: "tbc",
  agent_configuration: "cac",

  // Virtual resources (no database models associated).
  internal_mcp_server: "ims",
};

export const CROSS_WORKSPACE_RESOURCES_WORKSPACE_ID: ModelId = 0;

const ALL_RESOURCES_PREFIXES = Object.values(RESOURCES_PREFIX);

type ResourceNameType = keyof typeof RESOURCES_PREFIX;

const sIdCache = new Map<string, string>();

export function getResourcePrefix(resourceName: ResourceNameType): string {
  return RESOURCES_PREFIX[resourceName];
}

export function dangerouslyMakeSIdWithCustomFirstPrefix(
  resourceName: "internal_mcp_server",
  {
    id,
    workspaceId,
    firstPrefix,
  }: {
    id: ModelId;
    workspaceId: ModelId;
    firstPrefix: number;
  }
): string {
  return _makeSId(resourceName, {
    id,
    workspaceId,
    customFirstPrefix: firstPrefix,
  });
}

export function makeSId(
  resourceName: Exclude<ResourceNameType, "internal_mcp_server">,
  {
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }
): string {
  return _makeSId(resourceName, {
    id,
    workspaceId,
  });
}

function _makeSId(
  resourceName: ResourceNameType,
  {
    id,
    workspaceId,
    customFirstPrefix = LEGACY_REGION_BIT,
    customSecondPrefix = LEGACY_SHARD_BIT,
  }: {
    id: ModelId;
    workspaceId: ModelId;
    customFirstPrefix?: number;
    customSecondPrefix?: number;
  }
): string {
  const idsToEncode = [customFirstPrefix, customSecondPrefix, workspaceId, id];

  // Computing the sId is relatively expensive and we have a lot of them.
  // We cache them in memory to avoid recomputing them, they are immutable.
  const key = `${resourceName}_${idsToEncode.join("_")}`;
  const cached = sIdCache.get(key);
  if (cached) {
    return cached;
  }

  const prefix = RESOURCES_PREFIX[resourceName];
  if (!prefix) {
    throw new Error(`Invalid resource name: ${resourceName}`);
  }

  const sId = `${prefix}_${sqids.encode(idsToEncode)}`;
  sIdCache.set(key, sId);
  return sId;
}

export function getIdsFromSId(sId: string): Result<
  {
    workspaceModelId: ModelId;
    resourceModelId: ModelId;
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

    return new Ok({
      workspaceModelId: workspaceId,
      resourceModelId: resourceId,
    });
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

  return sIdsRes.value.resourceModelId;
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
  workspaceModelId: ModelId;
  resourceModelId: ModelId;
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
 * Generates a long, secure, non-guessable secret composed of
 * URL-safe alphanumeric characters. It uses a cryptographically
 * secure RNG (Web Crypto's getRandomValues when available) to draw
 * random bytes, then maps them uniformly to base62 characters.
 *
 * length: number of characters to return (default 64).
 */
export function generateSecureSecret(length = 64): string {
  const bytes = getSecureRandomBytes(length);
  return Buffer.from(bytes)
    .map(uniformByteToCode62)
    .map(alphanumFromCode62)
    .toString();
}

function hasProp<K extends PropertyKey>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function hasWebCrypto(obj: unknown): obj is {
  crypto: { getRandomValues: (arr: ArrayBufferView) => ArrayBufferView };
} {
  if (!hasProp(obj, "crypto")) {
    return false;
  }
  const crypto = obj.crypto;
  if (!hasProp(crypto, "getRandomValues")) {
    return false;
  }
  return typeof crypto.getRandomValues === "function";
}

function getSecureRandomBytes(length: number): Uint8Array {
  // Prefer Web Crypto API (browser and modern runtimes).
  if (hasWebCrypto(globalThis)) {
    const arr = new Uint8Array(length);
    globalThis.crypto.getRandomValues(arr);
    return arr;
  }
  // Best-effort fallback if Web Crypto is unavailable.
  const arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
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

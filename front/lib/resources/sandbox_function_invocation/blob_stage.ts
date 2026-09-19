import { GCS_CONTENT_CACHE_TTL_MS } from "@app/lib/resources/agent_mcp_action/output_storage";
import {
  cacheWithRedis,
  invalidateCacheWithRedis,
  warmCacheWithRedis,
} from "@app/lib/utils/cache";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Pre-GCS stage for sandbox-function invocation blobs. The Temporal activity
 * (and other processes) must read input/context before the deferred GCS write
 * finishes; Redis bridges that window the same way action-output staging does.
 */
export const SANDBOX_FUNCTION_INVOCATION_BLOB_CACHE_TTL_MS =
  GCS_CONTENT_CACHE_TTL_MS;

/**
 * Loader identity for `cacheWithRedis` / `warmCacheWithRedis` keying only.
 * Misses mean the write-behind window expired or was never warmed — not a GCS fetch.
 */
async function sandboxFunctionInvocationBlob(
  _invocationId: string
): Promise<object | null> {
  return null;
}

const invocationBlobCacheKey = (invocationId: string) =>
  `sfi_blob:${invocationId}:v1`;

const warmSandboxFunctionInvocationBlob = warmCacheWithRedis(
  sandboxFunctionInvocationBlob,
  invocationBlobCacheKey,
  { ttlMs: SANDBOX_FUNCTION_INVOCATION_BLOB_CACHE_TTL_MS }
);

const readSandboxFunctionInvocationBlobCached = cacheWithRedis(
  sandboxFunctionInvocationBlob,
  invocationBlobCacheKey,
  {
    cacheNullValues: false,
    ttlMs: SANDBOX_FUNCTION_INVOCATION_BLOB_CACHE_TTL_MS,
  }
);

const invalidateSandboxFunctionInvocationBlob = invalidateCacheWithRedis(
  sandboxFunctionInvocationBlob,
  invocationBlobCacheKey
);

export async function stageSandboxFunctionInvocationBlob(
  invocationId: string,
  data: object
): Promise<Result<void, Error>> {
  try {
    await warmSandboxFunctionInvocationBlob(data, invocationId);
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

export async function readStagedSandboxFunctionInvocationBlob(
  invocationId: string
): Promise<Result<object | null, Error>> {
  try {
    return new Ok(await readSandboxFunctionInvocationBlobCached(invocationId));
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/** Drop the stage (e.g. on invocation delete, or when replacing the blob from GCS only). */
export async function clearStagedSandboxFunctionInvocationBlob(
  invocationId: string
): Promise<Result<void, Error>> {
  try {
    await invalidateSandboxFunctionInvocationBlob(invocationId);
    return new Ok(undefined);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

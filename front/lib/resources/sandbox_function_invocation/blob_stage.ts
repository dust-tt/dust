import { GCS_CONTENT_CACHE_TTL_MS } from "@app/lib/resources/agent_mcp_action/output_storage";
import {
  cacheWithRedis,
  invalidateCacheWithRedis,
  warmCacheWithRedis,
} from "@app/lib/utils/cache";

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
  _invocationSId: string
): Promise<object | null> {
  return null;
}

const invocationBlobCacheKey = (invocationSId: string) =>
  `sfi_blob:${invocationSId}:v1`;

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
  invocationSId: string,
  data: object
): Promise<void> {
  await warmSandboxFunctionInvocationBlob(data, invocationSId);
}

export async function readStagedSandboxFunctionInvocationBlob(
  invocationSId: string
): Promise<object | null> {
  return readSandboxFunctionInvocationBlobCached(invocationSId);
}

/** Drop the stage (e.g. on invocation delete, or when replacing the blob from GCS only). */
export async function clearStagedSandboxFunctionInvocationBlob(
  invocationSId: string
): Promise<void> {
  await invalidateSandboxFunctionInvocationBlob(invocationSId);
}

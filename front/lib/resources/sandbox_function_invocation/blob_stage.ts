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
 * Pre-GCS stage for sandbox-function invocation blobs. Redis bridges the window
 * between create/terminal transitions and the deferred GCS write the same way
 * action-output staging does.
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

/**
 * @cc [owner:Fraggle] stage-before-deferred-gcs
 * Callers that defer the GCS write MUST stage via this helper first so other
 * processes (notably the Temporal activity) can read input/context before the
 * deferred upload finishes. Failures MUST be returned as `Err` (not thrown) so
 * callers can fall back to a synchronous GCS write without catching repository
 * exceptions.
 */
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

/**
 * @cc [owner:Fraggle] staged-read-falls-back-explicitly
 * Redis/JSON failures MUST be returned as `Err` so `getData` can fall back to
 * GCS via an explicit result rather than catching helper exceptions. A cache
 * miss (`Ok(null)`) is not an error — it means the write-behind window expired
 * or was never warmed.
 */
export async function readStagedSandboxFunctionInvocationBlob(
  invocationId: string
): Promise<Result<object | null, Error>> {
  try {
    return new Ok(await readSandboxFunctionInvocationBlobCached(invocationId));
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * @cc [owner:Fraggle] clear-stage-best-effort
 * Cleanup failures MUST be returned as `Err` so delete paths can log and
 * continue without catching repository exceptions. Callers treat clear as
 * best-effort after the durable GCS object (or row) is already gone.
 */
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

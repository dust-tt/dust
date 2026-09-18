import { getRedisCacheClient } from "@app/lib/api/redis";
import { GCS_CONTENT_CACHE_TTL_MS } from "@app/lib/resources/agent_mcp_action/output_storage";

/**
 * Pre-GCS stage for sandbox-function invocation blobs. The Temporal activity
 * (and other processes) must read input/context before the deferred GCS write
 * finishes; Redis bridges that window the same way action-output staging does.
 */
export const SANDBOX_FUNCTION_INVOCATION_BLOB_CACHE_TTL_MS =
  GCS_CONTENT_CACHE_TTL_MS;

function invocationBlobCacheKey(invocationSId: string): string {
  return `cacheWithRedis-sandboxFunctionInvocationBlob-sfi_blob:${invocationSId}:v1`;
}

export async function stageSandboxFunctionInvocationBlob(
  invocationSId: string,
  data: unknown
): Promise<void> {
  const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
  await redisCli.set(
    invocationBlobCacheKey(invocationSId),
    JSON.stringify(data),
    {
      PX: SANDBOX_FUNCTION_INVOCATION_BLOB_CACHE_TTL_MS,
    }
  );
}

export async function readStagedSandboxFunctionInvocationBlob(
  invocationSId: string
): Promise<unknown | null> {
  const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
  const raw = await redisCli.get(invocationBlobCacheKey(invocationSId));
  if (raw === null) {
    return null;
  }
  return JSON.parse(raw) as unknown;
}

/** Drop the stage (e.g. on invocation delete, or when replacing the blob from GCS only). */
export async function clearStagedSandboxFunctionInvocationBlob(
  invocationSId: string
): Promise<void> {
  const redisCli = await getRedisCacheClient({ origin: "cache_with_redis" });
  await redisCli.del(invocationBlobCacheKey(invocationSId));
}

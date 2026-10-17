import { randomUUID } from "node:crypto";
import { REDIS_CACHE_CONCURRENCY } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { heartbeatWithoutCancelCheck } from "@app/lib/temporal";
import { concurrentExecutor, withRetry } from "@app/lib/utils/async_utils";
import { cacheWithRedis, warmCacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS } from "@app/temporal/agent_loop/config";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const MCP_OUTPUT_ITEMS_PREFIX = "mcp_output_items";
const GCS_CONCURRENCY = 4;
const GCS_REQUEST_TIMEOUT_MS = 15_000;
// The request timeout also covers sending the body, so writes get extra time for their payload at
// this minimum throughput (~1 MB/s).
const GCS_UPLOAD_MIN_BYTES_PER_MS = 1_000;
const GCS_WRITE_MAX_REQUEST_TIMEOUT_MS =
  TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS * 0.75;

export const GCS_CONTENT_CACHE_TTL_MS = 15 * 60 * 1000;

type OutputContent = CallToolResult["content"][number];

// Writes live under the workspace prefix `w/<wsId>/...` so they are included by the
// workspace-relocation file transfer.
function getActionOutputGcsPrefix(
  auth: Authenticator,
  actionId: ModelId
): string {
  const workspace = auth.getNonNullableWorkspace();
  const actionIdString = makeSId("mcp_action", {
    id: actionId,
    workspaceId: workspace.id,
  });
  return `w/${workspace.sId}/${MCP_OUTPUT_ITEMS_PREFIX}/${actionIdString}/`;
}

export function getGcsWriteRequestTimeoutMs(byteLength: number): number {
  return Math.min(
    GCS_REQUEST_TIMEOUT_MS +
      Math.ceil(byteLength / GCS_UPLOAD_MIN_BYTES_PER_MS),
    GCS_WRITE_MAX_REQUEST_TIMEOUT_MS
  );
}

function getGcsPath(
  auth: Authenticator,
  action: AgentMCPActionResource,
  objectName: string
): string {
  return `${getActionOutputGcsPrefix(auth, action.id)}${objectName}.json`;
}

/**
 * @cc [owner:tdraier,label:performance] heartbeat-per-gcs-write
 * MUST heartbeat the current Temporal activity, if any, after each object write attempt, so that
 * writing many objects is not mistaken for a stalled activity.
 */
/**
 * @cc [owner:tdraier,label:performance] bounded-gcs-write-attempt
 * Each object write attempt MUST be bounded by `getGcsWriteRequestTimeoutMs` of its payload size,
 * which stays below the tool activity heartbeat timeout, and each cleanup delete attempt after a
 * failed write by `GCS_REQUEST_TIMEOUT_MS`, so that a request stuck on a dead connection fails
 * instead of stalling past the activity heartbeat timeout.
 */
async function batchWriteContentsToGcsAtPaths(
  action: AgentMCPActionResource,
  itemsWithPaths: Array<{ content: OutputContent; gcsPath: string }>
): Promise<Result<string[], Error>> {
  let firstError: Error | null = null;
  let successCount = 0;

  await concurrentExecutor(
    itemsWithPaths,
    async ({ content, gcsPath }) => {
      const data = Buffer.from(JSON.stringify(content), "utf-8");
      const file = getPrivateUploadBucket().file(gcsPath, {
        requestTimeoutMs: getGcsWriteRequestTimeoutMs(data.length),
      });

      const writeResult = await withRetry(async () => {
        try {
          // Resumable uploads (the SDK default) ignore `timeout`.
          await file.save(data, {
            contentType: "application/json",
            resumable: false,
          });
        } finally {
          heartbeatWithoutCancelCheck();
        }
      });

      if (writeResult.isErr()) {
        if (!firstError) {
          firstError = writeResult.error;
        }
        return;
      }

      successCount += 1;
    },
    { concurrency: GCS_CONCURRENCY }
  );

  if (firstError) {
    logger.error(
      {
        err: firstError,
        itemCount: itemsWithPaths.length,
        successCount,
      },
      "Failed to write MCP output items to GCS"
    );

    // A failed save may still have persisted its object before returning an error. Delete every
    // attempted path so callers never have to reason about partial GCS writes.
    const cleanupResult = await deleteContentsFromGcs(
      itemsWithPaths.map(({ gcsPath }) => gcsPath)
    );
    if (cleanupResult.isErr()) {
      logger.error(
        { err: cleanupResult.error, actionId: action.sId },
        "Failed to clean up partially written MCP output items"
      );
    }

    return new Err(firstError);
  }

  return new Ok(itemsWithPaths.map(({ gcsPath }) => gcsPath));
}

/**
 * Writes new output contents to UUID-backed GCS objects concurrently.
 * Paths are returned in the same order as the provided contents.
 */
export async function batchWriteContentsToGcs(
  auth: Authenticator,
  action: AgentMCPActionResource,
  contents: OutputContent[]
): Promise<Result<string[], Error>> {
  return batchWriteContentsToGcsAtPaths(
    action,
    contents.map((content) => ({
      content,
      gcsPath: getGcsPath(auth, action, randomUUID()),
    }))
  );
}

/**
 * Fetches content from GCS. Throws on failure (cacheWithRedis propagates the error).
 */
// itemId is unused in the fetch logic but passed to populate the cache key.
async function fetchGcsContent(
  auth: Authenticator,
  gcsPath: string,
  _itemId: ModelId
): Promise<OutputContent> {
  const bucket = getPrivateUploadBucket();
  const file = bucket.file(gcsPath);

  const [buffer] = await file.download();

  return JSON.parse(buffer.toString("utf-8"));
}

// Bump the `:v1` suffix any time the cached value shape changes, so stale entries from previous
// formats are orphaned instead of mis-parsed.
export const gcsContentCacheKey = (
  auth: Authenticator,
  _gcsPath: string,
  itemId: ModelId
) => `w:${auth.getNonNullableWorkspace().sId}:mcp_output:${itemId}:v1`;

const fetchGcsContentCached = cacheWithRedis(
  fetchGcsContent,
  gcsContentCacheKey,
  {
    cacheNullValues: false,
    ttlMs: GCS_CONTENT_CACHE_TTL_MS,
  }
);

const stageOneGcsContent = warmCacheWithRedis(
  fetchGcsContent,
  gcsContentCacheKey,
  { ttlMs: GCS_CONTENT_CACHE_TTL_MS }
);

/**
 * Stages MCP output item content in Redis under the same keys readers use
 * (`fetchGcsContentCached`). Call before returning from createOutputItems so
 * consumers can read without waiting on GCS. Replaces post-GCS cache warming.
 */
export async function stageMcpOutputContentCache(
  auth: Authenticator,
  items: Array<{
    itemId: ModelId;
    content: OutputContent;
    /** Unused for the key; pass the eventual GCS path when known, else "". */
    gcsPath?: string;
  }>
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await concurrentExecutor(
    items,
    async ({ itemId, gcsPath = "", content }) => {
      await stageOneGcsContent(content, auth, gcsPath, itemId);
    },
    { concurrency: REDIS_CACHE_CONCURRENCY }
  );
}

/** @deprecated Use {@link stageMcpOutputContentCache}. */
export const warmGcsContentCache = stageMcpOutputContentCache;

/**
 * Fetches content for a single item from cache (LRU) or GCS.
 *
 * TODO(2026-03-15 PERF): Add retry with exponential backoff to handle transient GCS failures.
 */
async function fetchContentFromGcs(
  auth: Authenticator,
  gcsPath: string,
  itemId: ModelId
): Promise<Result<OutputContent, Error>> {
  try {
    const content = await fetchGcsContentCached(auth, gcsPath, itemId);
    return new Ok(content);
  } catch (err) {
    logger.error(
      { err: normalizeError(err), gcsPath },
      "Failed to fetch MCP output content from GCS"
    );

    return new Err(normalizeError(err));
  }
}

/**
 * Batch-fetches content for multiple items from cache/GCS.
 */
export async function batchFetchContentsFromGcs(
  auth: Authenticator,
  items: Array<{
    itemId: ModelId;
    gcsPath: string;
  }>
): Promise<Result<Map<ModelId, OutputContent>, Error>> {
  const results = new Map<ModelId, OutputContent>();
  let firstError: Error | null = null;

  await concurrentExecutor(
    items,
    async ({ itemId, gcsPath }) => {
      const result = await fetchContentFromGcs(auth, gcsPath, itemId);
      if (result.isOk()) {
        results.set(itemId, result.value);
      } else if (!firstError) {
        firstError = result.error;
      }
    },
    { concurrency: GCS_CONCURRENCY }
  );

  if (firstError) {
    return new Err(firstError);
  }

  return new Ok(results);
}

/**
 * Deletes GCS files by path. Not-found errors are ignored (already deleted).
 * Returns Err if any deletion fails for other reasons.
 *
 * Prefer {@link deleteActionOutputsFromGcs} when deleting all outputs for
 * one or more actions — prefix delete is far cheaper than per-object deletes.
 */
export async function deleteContentsFromGcs(
  gcsPaths: string[]
): Promise<Result<void, Error>> {
  if (gcsPaths.length === 0) {
    return new Ok(undefined);
  }

  try {
    const bucket = getPrivateUploadBucket();
    await concurrentExecutor(
      gcsPaths,
      async (gcsPath) => {
        const deleteResult = await withRetry(async () => {
          try {
            await bucket.delete(gcsPath, {
              ignoreNotFound: true,
              requestTimeoutMs: GCS_REQUEST_TIMEOUT_MS,
            });
          } finally {
            heartbeatWithoutCancelCheck();
          }
        });
        if (deleteResult.isErr()) {
          throw deleteResult.error;
        }
      },
      { concurrency: GCS_CONCURRENCY }
    );
  } catch (err) {
    logger.error(
      { err: normalizeError(err), pathCount: gcsPaths.length },
      "Failed to delete MCP output content from GCS"
    );
    return new Err(normalizeError(err));
  }

  return new Ok(undefined);
}

/**
 * Deletes all GCS objects under each action's output prefix via a single
 * `deleteFiles({ prefix })` call per action (GCS batches internally).
 * Empty prefixes are a no-op. Failures are logged and returned as Err.
 */
async function deleteActionOutputPrefixesFromGcs(
  auth: Authenticator,
  actionIds: ModelId[]
): Promise<Result<void, Error>> {
  if (actionIds.length === 0) {
    return new Ok(undefined);
  }

  const prefixes = actionIds.map((actionId) =>
    getActionOutputGcsPrefix(auth, actionId)
  );

  try {
    const bucket = getPrivateUploadBucket();
    await concurrentExecutor(
      prefixes,
      async (prefix) => {
        await bucket.deleteByPrefix(prefix);
      },
      { concurrency: GCS_CONCURRENCY }
    );
  } catch (err) {
    logger.error(
      { err: normalizeError(err), actionCount: actionIds.length },
      "Failed to delete MCP output prefixes from GCS"
    );
    return new Err(normalizeError(err));
  }

  return new Ok(undefined);
}

/**
 * Deletes GCS outputs for the given actions: one prefix delete per action,
 * plus per-object deletes for leftover/legacy paths outside those prefixes.
 */
export async function deleteActionOutputsFromGcs(
  auth: Authenticator,
  actionIds: ModelId[],
  gcsPaths: string[]
): Promise<Result<void, Error>> {
  const prefixResult = await deleteActionOutputPrefixesFromGcs(auth, actionIds);
  if (prefixResult.isErr()) {
    return prefixResult;
  }

  const prefixes = actionIds.map((actionId) =>
    getActionOutputGcsPrefix(auth, actionId)
  );
  const uncoveredPaths = gcsPaths.filter(
    (gcsPath) => !prefixes.some((prefix) => gcsPath.startsWith(prefix))
  );

  return deleteContentsFromGcs(uncoveredPaths);
}

// --- Sandbox-function action output staging (same Redis helpers, action-scoped key) ---

export const SANDBOX_FUNCTION_ACTION_OUTPUT_CACHE_TTL_MS =
  GCS_CONTENT_CACHE_TTL_MS;

/**
 * Loader identity for `cacheWithRedis` / `warmCacheWithRedis` keying only.
 * Misses mean the write-behind window expired or was never warmed — not a GCS fetch.
 */
async function sandboxFunctionActionOutput(
  _actionId: string
): Promise<object | null> {
  return null;
}

const sandboxFunctionActionOutputCacheKey = (actionId: string) =>
  `sfa_output:${actionId}:v1`;

const warmSandboxFunctionActionOutput = warmCacheWithRedis(
  sandboxFunctionActionOutput,
  sandboxFunctionActionOutputCacheKey,
  { ttlMs: SANDBOX_FUNCTION_ACTION_OUTPUT_CACHE_TTL_MS }
);

const readSandboxFunctionActionOutputCached = cacheWithRedis(
  sandboxFunctionActionOutput,
  sandboxFunctionActionOutputCacheKey,
  {
    cacheNullValues: false,
    ttlMs: SANDBOX_FUNCTION_ACTION_OUTPUT_CACHE_TTL_MS,
  }
);

/**
 * Stages the full sandbox-function action output envelope in Redis so poll
 * `readOutput` can return before the GCS write finishes.
 */
export async function stageSandboxFunctionActionOutput(
  _auth: Authenticator,
  actionId: string,
  output: object
): Promise<void> {
  await warmSandboxFunctionActionOutput(output, actionId);
}

/**
 * Reads a staged sandbox-function action output, if still within TTL.
 */
export async function readStagedSandboxFunctionActionOutput(
  actionId: string
): Promise<object | null> {
  return readSandboxFunctionActionOutputCached(actionId);
}

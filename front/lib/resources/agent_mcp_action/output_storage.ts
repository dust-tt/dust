import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const GCS_PREFIX = "mcp_output_items";
const GCS_CONCURRENCY = 4;

type OutputContent = CallToolResult["content"][number];

function getGcsPath(
  auth: Authenticator,
  action: AgentMCPActionResource,
  itemId: ModelId
): string {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const actionId = action.sId;

  return `${GCS_PREFIX}/w/${workspaceId}/${actionId}/${itemId}.json`;
}

/**
 * Writes multiple output items to GCS concurrently.
 * Returns Ok with a map of itemId → gcsPath, or Err on failure.
 *
 * TODO(2026-03-15): Add retry with exponential backoff to handle transient
 * GCS failures.
 */
export async function batchWriteContentsToGcs(
  auth: Authenticator,
  action: AgentMCPActionResource,
  items: Array<{
    itemId: ModelId;
    content: OutputContent;
  }>
): Promise<Result<Map<ModelId, string>, Error>> {
  const results = new Map<ModelId, string>();

  try {
    await concurrentExecutor(
      items,
      async ({ itemId, content }) => {
        const gcsPath = getGcsPath(auth, action, itemId);
        const bucket = getPrivateUploadBucket();
        const file = bucket.file(gcsPath);
        const json = JSON.stringify(content);
        await file.save(Buffer.from(json, "utf-8"), {
          contentType: "application/json",
        });
        results.set(itemId, gcsPath);
      },
      { concurrency: GCS_CONCURRENCY }
    );
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        itemCount: items.length,
        successCount: results.size,
      },
      "Failed to write MCP output items to GCS"
    );
    return new Err(normalizeError(err));
  }

  return new Ok(results);
}

/**
 * Fetches raw JSON content from GCS. Throws on failure (cacheWithRedis propagates the error).
 */
// itemId is unused in the fetch logic but passed to populate the cache key.
async function fetchGcsContent(
  auth: Authenticator,
  gcsPath: string,
  _itemId: ModelId
): Promise<string> {
  const bucket = getPrivateUploadBucket();
  const file = bucket.file(gcsPath);

  const [buffer] = await file.download();

  return buffer.toString("utf-8");
}

const fetchGcsContentCached = cacheWithRedis(
  fetchGcsContent,
  (auth, _gcsPath, itemId) =>
    `w:${auth.getNonNullableWorkspace().sId}:mcp_output:${itemId}`,
  { cacheNullValues: false }
);

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
    const raw = await fetchGcsContentCached(auth, gcsPath, itemId);
    return new Ok(JSON.parse(raw) as OutputContent);
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
        await bucket.delete(gcsPath, { ignoreNotFound: true });
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

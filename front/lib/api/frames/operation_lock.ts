import { getRedisStreamClient } from "@app/lib/api/redis";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import tracer from "@app/logger/tracer";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_ACQUIRE_TIMEOUT_MS = 30_000;
const FRAME_OPERATION_LOCK_RETRY_INTERVAL_MS = 100;
// Frame operations are synchronous and bounded. Lease expiry defines an abandoned operation;
// stale-prefix recovery may remove uncommitted artifacts once a new publisher owns the lock.
const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

function getFrameSourceLockName(frameId: string): string {
  return `frame:source:${frameId}`;
}

async function withFrameOperationLock<T, E>(
  lockName: string,
  resource: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  const client = await getRedisStreamClient({ origin: "lock" });
  const lockValue = await tracer.trace(
    "lock.acquire",
    { resource },
    async () => {
      const startMs = Date.now();
      while (Date.now() - startMs < FRAME_OPERATION_LOCK_ACQUIRE_TIMEOUT_MS) {
        const acquired = await distributedLock(
          client,
          lockName,
          FRAME_OPERATION_LOCK_TTL_MS
        );
        if (acquired) {
          return acquired;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, FRAME_OPERATION_LOCK_RETRY_INTERVAL_MS)
        );
      }
      return undefined;
    }
  );
  if (!lockValue) {
    return new Err(
      new SandboxFunctionError(
        "publish_conflict",
        "Another operation is in progress for this Frame; retry shortly."
      )
    );
  }

  try {
    return await callback();
  } finally {
    await distributedUnlock(client, lockName, lockValue);
  }
}

export async function withFramePublishLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withFrameOperationLock(
    getFramePublishLockName(frameId),
    "frame.publish",
    callback
  );
}

export async function withFrameSourceLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withFrameOperationLock(
    getFrameSourceLockName(frameId),
    "frame.source",
    callback
  );
}

export async function withFrameSourceAndPublishLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withFrameSourceLock(frameId, () =>
    withFramePublishLock(frameId, callback)
  );
}

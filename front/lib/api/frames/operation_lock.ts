import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  executeWithLockResult,
  LockAcquisitionTimeoutError,
} from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

export function getFrameSourceLockName(frameId: string): string {
  return `frame:source:${frameId}`;
}

export function withFramePublishLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return executeWithLockResult(
    getFramePublishLockName(frameId),
    callback,
    30_000,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

async function withTypedFrameOperationLock<T, E>(
  lockName: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  const result = await executeWithLockResult(lockName, callback, 30_000, {
    lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS,
    traceAcquireResource: "frame.source",
  });
  if (result.isErr()) {
    const error = result.error;
    if (error instanceof LockAcquisitionTimeoutError) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          "Another publication or source operation is in progress for this Frame; retry shortly."
        )
      );
    }
    return new Err(error);
  }
  return result;
}

export function withFrameSourceLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withTypedFrameOperationLock(getFrameSourceLockName(frameId), callback);
}

export function withFrameSourceAndPublishLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withFrameSourceLock(frameId, () =>
    withTypedFrameOperationLock(getFramePublishLockName(frameId), callback)
  );
}

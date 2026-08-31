import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type {
  LockAcquisitionTimeoutError,
  LockLeaseGuard,
  LockLeaseLostError,
} from "@app/lib/lock";
import {
  executeWithRenewingLockResult,
  isLockAcquisitionTimeoutError,
  isLockLeaseLostError,
} from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;

type FrameOperationLockError = LockAcquisitionTimeoutError | LockLeaseLostError;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

export function getFrameSourceLockName(frameId: string): string {
  return `frame:source:${frameId}`;
}

export function withFramePublishLock<T, E>(
  frameId: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>
): Promise<Result<T, E | FrameOperationLockError>> {
  return executeWithRenewingLockResult(
    getFramePublishLockName(frameId),
    callback,
    30_000,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

async function withTypedFrameOperationLock<T, E>(
  lockName: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>
): Promise<Result<T, E | SandboxFunctionError>> {
  const result = await executeWithRenewingLockResult(
    lockName,
    callback,
    30_000,
    {
      lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS,
      traceAcquireResource: "frame.source",
    }
  );
  if (result.isErr()) {
    const error = result.error;
    if (
      isLockAcquisitionTimeoutError(error) ||
      isLockLeaseLostError(error)
    ) {
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
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withTypedFrameOperationLock(getFrameSourceLockName(frameId), callback);
}

export function withFrameSourceAndPublishLock<T, E>(
  frameId: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>
): Promise<Result<T, E | SandboxFunctionError>> {
  return withFrameSourceLock(frameId, (sourceLease) =>
    withTypedFrameOperationLock(
      getFramePublishLockName(frameId),
      (publishLease) =>
        callback({
          check: () => {
            const sourceHeld = sourceLease.check();
            return sourceHeld.isErr() ? sourceHeld : publishLease.check();
          },
        })
    )
  );
}

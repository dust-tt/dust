import type {
  LockAcquisitionTimeoutError,
  LockLeaseGuard,
  LockLeaseLostError,
} from "@app/lib/lock";
import { executeWithRenewingLockResult } from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";

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

export function withFrameSourceLock<T, E>(
  frameId: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>
): Promise<Result<T, E | FrameOperationLockError>> {
  return executeWithRenewingLockResult(
    getFrameSourceLockName(frameId),
    callback,
    30_000,
    {
      lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS,
      traceAcquireResource: "frame.source",
    }
  );
}

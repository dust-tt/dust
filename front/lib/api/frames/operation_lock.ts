import type { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { executeWithLockResult } from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
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

import type { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { executeWithLock, executeWithLockResult } from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;
const FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS = 30_000;

export class LegacyFrameMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyFrameMutationConflictError";
  }
}

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

export function getFrameSourceLockName(frameId: string): string {
  return `frame:source:${frameId}`;
}

export function getLegacyFrameMutationLockName(frameId: string): string {
  return `file:edit:${frameId}`;
}

export function withFramePublishLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return executeWithLockResult(
    getFramePublishLockName(frameId),
    callback,
    FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

export function withFrameSourceLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return executeWithLockResult(
    getFrameSourceLockName(frameId),
    callback,
    FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

export function withFrameSourceAndPublishLocks<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return withFrameSourceLock(frameId, () =>
    withFramePublishLock(frameId, callback)
  );
}

/** Serialize conversion with every mutation of the same legacy Frame. */
export function withLegacyFrameMutationLock<T>(
  frameId: string,
  callback: () => Promise<T>
): Promise<T> {
  return executeWithLock(
    getLegacyFrameMutationLockName(frameId),
    callback,
    FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

export function withLegacyFrameMutationResultLock<T, E>(
  frameId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return executeWithLockResult(
    getLegacyFrameMutationLockName(frameId),
    callback,
    FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

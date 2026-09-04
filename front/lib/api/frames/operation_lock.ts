import type { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { executeWithLockResult } from "@app/lib/lock";
import type { Result } from "@app/types/shared/result";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;
const FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS = 30_000;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

export function getFrameSourceLockName(frameId: string): string {
  return `frame:source:${frameId}`;
}

export function getFrameWorkspaceSourceLockName(workspaceId: string): string {
  return `frame:source-workspace:${workspaceId}`;
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

export function withFrameWorkspaceSourceLock<T, E>(
  workspaceId: string,
  callback: () => Promise<Result<T, E>>
): Promise<Result<T, E | LockAcquisitionTimeoutError>> {
  return executeWithLockResult(
    getFrameWorkspaceSourceLockName(workspaceId),
    callback,
    FRAME_OPERATION_LOCK_ACQUISITION_TIMEOUT_MS,
    { lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS }
  );
}

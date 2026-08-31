import { executeWithLock } from "@app/lib/lock";

const FRAME_OPERATION_LOCK_TTL_MS = 10 * 60_000;

export function getFramePublishLockName(frameId: string): string {
  return `frame:publish:${frameId}`;
}

export function withFramePublishLock<T>(
  frameId: string,
  callback: () => Promise<T>
): Promise<T> {
  return executeWithLock(getFramePublishLockName(frameId), callback, 30_000, {
    lockTtlMs: FRAME_OPERATION_LOCK_TTL_MS,
  });
}

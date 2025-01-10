import { v4 as uuidv4 } from "uuid";

export async function wakeLock<T>(
  autoCallback: () => Promise<T>,
  lockName?: string
): Promise<T> {
  if (!global.wakeLocks) {
    global.wakeLocks = new Set();
  }
  lockName ??= uuidv4();
  global.wakeLocks.add(lockName);
  try {
    const r = await autoCallback();
    return r;
  } finally {
    global.wakeLocks.delete(lockName);
  }
}

// If a lockName is provided, checks if that lock is free, otherwise checks if all locks are free
export function wakeLockIsFree(lockName?: string): boolean {
  if (lockName) {
    return !global.wakeLocks || !global.wakeLocks.has(lockName);
  }

  return !global.wakeLocks || global.wakeLocks.size === 0;
}

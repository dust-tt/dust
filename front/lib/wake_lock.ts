import { v4 as uuidv4 } from "uuid";

export async function wakeLock<T>(autoCallback: () => Promise<T>): Promise<T> {
  if (!global.wakeLocks) {
    global.wakeLocks = new Set();
  }
  const lockName = uuidv4();
  global.wakeLocks.add(lockName);
  try {
    const r = await autoCallback();
    return r;
  } finally {
    global.wakeLocks.delete(lockName);
  }
}

export function wakeLockIsFree(): boolean {
  return !global.wakeLocks || global.wakeLocks.size === 0;
}

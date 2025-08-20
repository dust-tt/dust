import { v4 as uuidv4 } from "uuid";

export interface WakeLockEntry {
  context?: Record<string, string | null>;
  id: string;
  startTime: number;
}

declare global {
  // eslint-disable-next-line no-var
  var wakeLocks: Map<string, WakeLockEntry> | undefined;
}

export async function wakeLock<T>(
  autoCallback: () => Promise<T>,
  context?: WakeLockEntry["context"]
): Promise<T> {
  if (!global.wakeLocks) {
    global.wakeLocks = new Map();
  }
  const lockId = uuidv4();
  const lockEntry: WakeLockEntry = {
    id: lockId,
    startTime: Date.now(),
    context,
  };

  global.wakeLocks.set(lockId, lockEntry);
  try {
    const r = await autoCallback();
    return r;
  } finally {
    global.wakeLocks.delete(lockId);
  }
}

export function wakeLockIsFree(): boolean {
  return !global.wakeLocks || global.wakeLocks.size === 0;
}

export function getWakeLockDetails(): WakeLockEntry[] {
  if (!global.wakeLocks) {
    return [];
  }

  return Array.from(global.wakeLocks.values());
}

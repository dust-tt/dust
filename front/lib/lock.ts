import { getRedisStreamClient, type RedisClientType } from "@app/lib/api/redis";
import tracer from "@app/logger/tracer";

// Distributed lock implementation using Redis
// Returns the lock value if the lock is acquired, that can be used to unlock, otherwise undefined.
export async function distributedLock(
  redisCli: RedisClientType,
  key: string,
  lockTtlMs: number = 5_000
): Promise<string | undefined> {
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random()}`;

  // Try to acquire the lock using SET with NX and PX options
  const result = await redisCli.set(lockKey, lockValue, {
    NX: true,
    PX: lockTtlMs,
  });

  if (result !== "OK") {
    // Lock acquisition failed, return undefined - no lock value.
    return undefined;
  }

  // Return the lock value that can be used to unlock.
  return lockValue;
}

export async function distributedUnlock(
  redisCli: RedisClientType,
  key: string,
  lockValue: string
): Promise<void> {
  const lockKey = `lock:${key}`;

  // Use Lua script to ensure atomic unlock (only delete if we own the lock: lock value matches)
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redisCli.eval(luaScript, {
    keys: [lockKey],
    arguments: [lockValue],
  });
}

const WAIT_BETWEEN_RETRIES = 100;

export class LockAcquisitionTimeoutError extends Error {
  constructor(lockName: string) {
    super(`Lock acquisition timed out for ${lockName}`);
    this.name = "LockAcquisitionTimeoutError";
  }
}

export const executeWithLock = async <T>(
  lockName: string,
  callback: () => Promise<T>,
  timeoutMs: number = 30_000,
  // Opt-in: when set, the acquisition wait (only) is wrapped in a
  // `lock.acquire` APM span with this resource, so contention/wait time is
  // visible separately from the time spent holding the lock. Off by default so
  // existing callers are unchanged and we don't span every lock app-wide.
  {
    lockTtlMs = 5_000,
    traceAcquireResource,
  }: { lockTtlMs?: number; traceAcquireResource?: string } = {}
): Promise<T> => {
  const client = await getRedisStreamClient({ origin: "lock" });

  const acquire = async (): Promise<string | undefined> => {
    const startMs = Date.now();
    let acquired: string | undefined;
    while (Date.now() - startMs < timeoutMs) {
      // Try to acquire the lock
      acquired = await distributedLock(client, lockName, lockTtlMs);
      if (acquired) {
        break;
      }
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, WAIT_BETWEEN_RETRIES));
    }
    return acquired;
  };

  const lockValue = traceAcquireResource
    ? await tracer.trace(
        "lock.acquire",
        { resource: traceAcquireResource },
        acquire
      )
    : await acquire();

  if (!lockValue) {
    throw new LockAcquisitionTimeoutError(lockName);
  }

  try {
    const result = await callback();
    return result;
  } finally {
    // Release the lock if we have it
    if (lockValue) {
      await distributedUnlock(client, lockName, lockValue);
    }
  }
};

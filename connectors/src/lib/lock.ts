import type { RedisClientType } from "redis";

import { redisClient } from "@connectors/types/shared/redis";

// Distributed lock implementation using Redis
// Returns the lock value if the lock is acquired, that can be used to unlock, otherwise undefined.
export async function distributedLock(
  redisCli: RedisClientType,
  key: string
): Promise<string | undefined> {
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random()}`;
  const lockTimeout = 5000; // 5 seconds timeout

  // Try to acquire the lock using SET with NX and PX options
  const result = await redisCli.set(lockKey, lockValue, {
    NX: true,
    PX: lockTimeout,
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

export const executeWithLock = async <T>(
  lockName: string,
  callback: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> => {
  const client = await redisClient({ origin: "lock" });

  const start = Date.now();
  let lockValue: string | undefined;
  while (Date.now() - start < timeoutMs) {
    // Try to acquire the lock
    lockValue = await distributedLock(client, lockName);
    if (lockValue) {
      break;
    }
    // Wait a bit before retrying
    await new Promise((resolve) => setTimeout(resolve, WAIT_BETWEEN_RETRIES));
  }

  if (!lockValue) {
    throw new Error(`Lock acquisition timed out for ${lockName}`);
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

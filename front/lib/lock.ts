import { randomUUID } from "crypto";

import mainLogger from "@app/logger/logger";

import { getRedisClient } from "./api/redis";

const logger = mainLogger.child(
  {
    module: "Lock",
  },
  { msgPrefix: "[LOCK] " }
);

/**
 * NOTES:
 * We use redis.eval to make calls in the same operation.
 * i.e: if we want to get and del a value, by using eval we make sure the'll be executed without race condition issue on the redis side.
 *
 * The lock extension is to avoid having unecessary long running lock (with huge timeout), or too short one.
 * i.e: If it's too long and a function fail, we'll have to wait for the lock to be freed before executing the next callback calling the lock.
 * A too short one we'll can have race condition again (if function are too long)
 * Having a lock extension help in the balance of handling failed dangling function.
 */

export type LockOptions = {
  /**
   * Maximum time to wait for lock acquisition in milliseconds
   * @default 30000 (30 seconds)
   */
  timeoutMs?: number;

  /**
   * Initial delay between retry attempts in milliseconds
   * @default 100
   */
  initialRetryDelayMs?: number;

  /**
   * Maximum delay between retry attempts in milliseconds
   * @default 1000
   */
  maxRetryDelayMs?: number;

  /**
   * Whether to automatically extend the lock while the operation is running
   * @default true for operations where timeout is longer than 1000ms
   */
  enableLockExtension?: boolean;

  /**
   * DANGER: Completely bypasses the lock mechanism when set to true.
   * Only use this in specific scenarios where you understand the implications.
   * @default false
   */
  __dangerouslySkipLock?: boolean;
};

export class Lock {
  /**
   * Execute a callback with Redis lock protection
   *
   * @param lockName Unique name for the lock
   * @param callback Function to execute while holding the lock
   * @param options Lock configuration options
   * @returns Promise resolving to the callback result
   * @throws Error if lock cannot be acquired within timeout
   */
  static async executeWithLock<T>(
    lockName: string,
    callback: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const {
      timeoutMs = 30000,
      initialRetryDelayMs = 100,
      maxRetryDelayMs = 1000,
      enableLockExtension = timeoutMs > 1000,
      __dangerouslySkipLock = false,
    } = options;

    if (__dangerouslySkipLock) {
      logger.warn({ lockName, bypass: true }, `Bypassing lock: ${lockName}`);
      const result = await callback();
      return result;
    }

    const client = await getRedisClient({ origin: "lock" });
    const lockKey = `lock:${lockName}`;
    const lockValue = `${Date.now()}-${randomUUID()}`;
    const start = Date.now();

    let acquired = false;
    let retryDelay = initialRetryDelayMs;
    let lockExtender: NodeJS.Timeout | null = null;

    try {
      // Try to acquire the lock for the given lock key
      while (
        !(await client.set(lockKey, lockValue, { NX: true, PX: timeoutMs }))
      ) {
        if (Date.now() - start >= timeoutMs) {
          throw new Error(`Lock acquisition timed out for ${lockName}`);
        }

        // Wait a bit with an exponential backoff
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 1.5, maxRetryDelayMs);
      }

      acquired = true;

      // If lock extension is activated, we'll check every x ms if the lockKey === lockValue
      // If yes, that means that lock is still used by the same function.
      // If no, an other instance of the calling function acquired the lock,
      // so we can just clear that interval and exit
      if (enableLockExtension) {
        // Set the lock extender check to 1/3 of the timeout
        const extensionInterval = Math.floor(timeoutMs / 3);

        lockExtender = setInterval(async () => {
          try {
            // Extend the lock only if we still own it.
            // Use script to also avoid race condition with redis calls
            const script = `
              if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
              else
                return 0
              end
            `;

            const result = await client.eval(script, {
              keys: [lockKey],
              arguments: [lockValue, String(timeoutMs)],
            });
            if (result === 0) {
              // we no longer own the lock
              logger.warn(
                { lockName },
                `Lock "${lockName}" was lost during execution and could not be extended`
              );
              clearInterval(lockExtender!);
              lockExtender = null;
            }
          } catch (err) {
            logger.error(
              { err, lockName },
              `Failed to extend lock "${lockName}"`
            );
            clearInterval(lockExtender!);
            lockExtender = null;
          }
        }, extensionInterval);
      }

      try {
        // Call the long running process protected of race condition
        const result = await callback();
        return result;
      } finally {
        // Once we done, we can free the lock extender if we have any
        if (lockExtender) {
          clearInterval(lockExtender);
          lockExtender = null;
        }

        // Release the lock atomically if still own it
        try {
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end`;

          await client.eval(script, {
            keys: [lockKey],
            arguments: [lockValue],
          });
        } catch (releaseError) {
          logger.error(
            { releaseError, lockName },
            `Failed to release lock "${lockName}"`
          );
        }
      }
    } catch (err) {
      // Last protection, if something failed somewhere before, we try to clean behind us

      // If we still own the lock and we have a lockExtender running, let's clear it
      if (acquired && lockExtender) {
        clearInterval(lockExtender);
      }

      // Let's free the lock atomically if we still own it.
      if (acquired) {
        try {
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end`;

          await client.eval(script, {
            keys: [lockName],
            arguments: [lockValue],
          });
        } catch (releaseError) {
          logger.error(
            { releaseError, lockName },
            `Failed to release lock "${lockName}"`
          );
        }
      }

      throw err;
    }
  }
}

import { getRedisClient } from "./api/redis";

const WAIT_BETWEEN_RETRIES = 100;

export class Lock {
  static async executeWithLock<T>(
    lockName: string,
    callback: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    const client = await getRedisClient({ origin: "lock" });
    const lockKey = `lock:${lockName}`;
    const lockValue = Date.now().toString();
    const start = Date.now();

    // Try to acquire the lock
    while (
      !(await client.set(lockKey, lockValue, { NX: true, PX: timeoutMs }))
    ) {
      // Check for timeout
      if (Date.now() - start >= timeoutMs) {
        throw new Error(`Lock acquisition timed out for ${lockName}`);
      }
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, WAIT_BETWEEN_RETRIES));
    }

    try {
      const result = await callback();
      return result;
    } finally {
      // Release the lock if we still own it
      const currentValue = await client.get(lockKey);
      if (currentValue === lockValue) {
        await client.del(lockKey);
      }
    }
  }
}

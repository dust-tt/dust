export class Lock {
  private static locks = new Map<string, Promise<void>>();

  static async executeWithLock<T>(
    lockName: string,
    callback: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    const start = Date.now();

    if (Lock.locks.has(lockName)) {
      const currentLock = Lock.locks.get(lockName);
      if (currentLock) {
        const remainingTime = timeoutMs - (Date.now() - start);
        if (remainingTime <= 0) {
          throw new Error(`Lock acquisition timed out for ${lockName}`);
        }

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Lock acquisition timed out for ${lockName}`));
          }, remainingTime);
        });

        await Promise.race([currentLock, timeoutPromise]);
      }
    }

    // Initialize resolveLock with a no-op function to satisfy TypeScript
    let resolveLock = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });

    Lock.locks.set(lockName, lockPromise);

    try {
      const result = await callback();
      return result;
    } finally {
      Lock.locks.delete(lockName);
      resolveLock();
    }
  }
}

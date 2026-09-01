import type { RedisClientType } from "@app/lib/api/redis";
import { getRedisStreamClient } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

type LockRedisClient = Pick<RedisClientType, "eval" | "set">;

// Distributed lock implementation using Redis
// Returns the lock value if the lock is acquired, that can be used to unlock, otherwise undefined.
export async function distributedLock(
  redisCli: LockRedisClient,
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
  redisCli: LockRedisClient,
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

export async function distributedRefresh(
  redisCli: LockRedisClient,
  key: string,
  lockValue: string,
  lockTtlMs: number
): Promise<boolean> {
  const lockKey = `lock:${key}`;
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const refreshed = await redisCli.eval(luaScript, {
    keys: [lockKey],
    arguments: [lockValue, String(lockTtlMs)],
  });

  return refreshed === 1;
}

const DEFAULT_RETRY_INTERVAL_MS = 100;

export class LockAcquisitionTimeoutError extends Error {
  constructor(readonly lockName: string) {
    super(`Lock acquisition timed out for ${lockName}`);
    this.name = "LockAcquisitionTimeoutError";
  }
}

export function isLockAcquisitionTimeoutError(
  error: unknown
): error is LockAcquisitionTimeoutError {
  return error instanceof LockAcquisitionTimeoutError;
}

export class LockLeaseLostError extends Error {
  constructor(readonly lockName: string) {
    super(`Lock lease lost for ${lockName}`);
    this.name = "LockLeaseLostError";
  }
}

export function isLockLeaseLostError(
  error: unknown
): error is LockLeaseLostError {
  return error instanceof LockLeaseLostError;
}

export interface LockLeaseGuard {
  check(): Result<void, LockLeaseLostError>;
}

type ExecuteWithLockOptions = {
  lockTtlMs?: number;
  // How long a waiter sleeps between acquisition attempts. The wait is blind
  // (no notification on release), so on a contended lock every waiter loses
  // in quanta of this interval — locks with short hold times on
  // latency-sensitive paths should pass something well under the default.
  retryIntervalMs?: number;
  traceAcquireResource?: string;
};

async function acquireLock(
  lockName: string,
  timeoutMs: number,
  // Opt-in: when set, the acquisition wait (only) is wrapped in a
  // `lock.acquire` APM span with this resource, so contention/wait time is
  // visible separately from the time spent holding the lock. Off by default so
  // existing callers are unchanged and we don't span every lock app-wide.
  {
    lockTtlMs = 5_000,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    traceAcquireResource,
  }: ExecuteWithLockOptions
): Promise<{ client: RedisClientType; lockValue: string | undefined }> {
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
      // Wait before retrying, jittered to half..full interval so concurrent
      // waiters spread out instead of stampeding the same retry tick.
      const jitteredWaitMs =
        retryIntervalMs / 2 + Math.random() * (retryIntervalMs / 2);
      await new Promise((resolve) => setTimeout(resolve, jitteredWaitMs));
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

  return { client, lockValue };
}

async function runWithAcquiredLock<T>(
  client: RedisClientType,
  lockName: string,
  lockValue: string,
  callback: () => Promise<T>
): Promise<T> {
  try {
    return await callback();
  } finally {
    await distributedUnlock(client, lockName, lockValue);
  }
}

function waitForRenewal(
  delayMs: number,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createLockLeaseGuard(
  lockName: string,
  lockTtlMs: number,
  lockAttemptStartedAtMs: number
): {
  guard: LockLeaseGuard;
  markLost: () => void;
  markRenewed: (renewedAtMs: number) => void;
} {
  const safetyMarginMs = Math.max(1, Math.floor(lockTtlMs / 10));
  let confirmedUntilMs = lockAttemptStartedAtMs + lockTtlMs - safetyMarginMs;
  let lost = false;
  const markLost = () => {
    lost = true;
  };

  return {
    guard: {
      check: () => {
        if (lost || performance.now() >= confirmedUntilMs) {
          markLost();
          return new Err(new LockLeaseLostError(lockName));
        }
        return new Ok(undefined);
      },
    },
    markLost,
    markRenewed: (renewedAtMs) => {
      confirmedUntilMs = renewedAtMs + lockTtlMs - safetyMarginMs;
    },
  };
}

async function runWithRenewingLockResult<T, E>(
  client: RedisClientType,
  lockName: string,
  lockValue: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>,
  lockTtlMs: number
): Promise<Result<T, E | LockLeaseLostError>> {
  const renewalIntervalMs = Math.max(1, Math.floor(lockTtlMs / 3));
  const lease = createLockLeaseGuard(lockName, lockTtlMs, performance.now());
  const stopController = new AbortController();
  const renew = async () => {
    const nextRenewalDelayMs = () =>
      renewalIntervalMs * (0.8 + Math.random() * 0.2);
    let waitMs = nextRenewalDelayMs();
    while (await waitForRenewal(waitMs, stopController.signal)) {
      if (lease.guard.check().isErr()) {
        return;
      }
      try {
        const refreshStartedAtMs = performance.now();
        const refreshed = await distributedRefresh(
          client,
          lockName,
          lockValue,
          lockTtlMs
        );
        if (!refreshed) {
          lease.markLost();
          logger.warn(
            { lockName },
            "Lost a distributed lock lease because its owner changed"
          );
          return;
        }
        lease.markRenewed(refreshStartedAtMs);
        waitMs = nextRenewalDelayMs();
      } catch (error) {
        lease.markLost();
        logger.warn(
          { error: normalizeError(error), lockName },
          "Lost a distributed lock lease after a refresh error"
        );
        return;
      }
    }
  };
  const renewal = renew();

  try {
    const result = await callback(lease.guard);
    stopController.abort();
    await renewal;
    const held = lease.guard.check();
    return held.isErr() ? held : result;
  } finally {
    stopController.abort();
    await renewal;
    try {
      await distributedUnlock(client, lockName, lockValue);
    } catch (error) {
      logger.error(
        { error: normalizeError(error), lockName },
        "Failed to unlock a distributed lock after its callback completed"
      );
    }
  }
}

export const executeWithLock = async <T>(
  lockName: string,
  callback: () => Promise<T>,
  timeoutMs: number = 30_000,
  options: ExecuteWithLockOptions = {}
): Promise<T> => {
  const { client, lockValue } = await acquireLock(lockName, timeoutMs, options);

  if (!lockValue) {
    throw new LockAcquisitionTimeoutError(lockName);
  }

  return runWithAcquiredLock(client, lockName, lockValue, callback);
};

export const executeWithLockResult = async <T, E>(
  lockName: string,
  callback: () => Promise<Result<T, E>>,
  timeoutMs: number = 30_000,
  options: ExecuteWithLockOptions = {}
): Promise<Result<T, E | LockAcquisitionTimeoutError>> => {
  const { client, lockValue } = await acquireLock(lockName, timeoutMs, options);

  if (!lockValue) {
    return new Err(new LockAcquisitionTimeoutError(lockName));
  }

  return runWithAcquiredLock(client, lockName, lockValue, callback);
};

export const executeWithRenewingLockResult = async <T, E>(
  lockName: string,
  callback: (
    lease: LockLeaseGuard
  ) => Promise<Result<T, E | LockLeaseLostError>>,
  timeoutMs: number = 30_000,
  options: ExecuteWithLockOptions = {}
): Promise<Result<T, E | LockAcquisitionTimeoutError | LockLeaseLostError>> => {
  const { lockTtlMs = 5_000 } = options;
  const { client, lockValue } = await acquireLock(lockName, timeoutMs, options);

  if (!lockValue) {
    return new Err(new LockAcquisitionTimeoutError(lockName));
  }

  return runWithRenewingLockResult(
    client,
    lockName,
    lockValue,
    callback,
    lockTtlMs
  );
};

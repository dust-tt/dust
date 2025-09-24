import _ from "lodash";

import { distributedLock, distributedUnlock } from "@connectors/lib/lock";
import { redisClient } from "@connectors/lib/redis";
import logger from "@connectors/logger/logger";

export type RateLimit = {
  limit: number;
  windowInMs: number;
};

export async function throttleWithRedis<T>(
  rateLimit: RateLimit,
  key: string,
  canBeIgnored: boolean,
  func: () => Promise<T>
): Promise<T | undefined> {
  const client = await redisClient({ origin: "throttle" });
  const redisKey = `throttle:${key}`;
  let lockValue: string | undefined;

  const getTimestamps = async () => {
    const timestamps = await client.lRange(redisKey, 0, -1);
    return timestamps.map(Number);
  };
  const addTimestamp = async (timestamp: number) => {
    await client.rPush(redisKey, timestamp.toString());
  };
  const removeTimestamp = async (timestamp: number) => {
    await client.lRem(redisKey, 1, timestamp.toString());
  };

  const acquireLock = async () => {
    const acquiredLockTimeout = 3000;
    const start = Date.now();

    while (Date.now() - start < acquiredLockTimeout) {
      lockValue = await distributedLock(client, redisKey);
      if (lockValue) {
        break;
      }
      // Sleep for 100ms before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!lockValue) {
      throw new Error("Failed to acquire lock for throttling");
    }
  };

  const releaseLock = async () => {
    if (lockValue) {
      await distributedUnlock(client, redisKey, lockValue);
    }
  };

  const throttleRes = await throttle({
    rateLimit,
    canBeIgnored,
    now: new Date().getTime(),
    acquireLock,
    releaseLock,
    getTimestamps,
    addTimestamp,
    removeTimestamp,
  });

  if (throttleRes.skip) {
    // Ignore the request
    return;
  } else if (throttleRes.delay && throttleRes.delay > 0) {
    logger.info({ delay: throttleRes }, "Delaying api request");
    await new Promise((resolve) => setTimeout(resolve, throttleRes.delay));
  } else if (throttleRes.delay === 0) {
    // Do nothing and just call the function
  } else {
    throw new Error("Invalid delay");
  }

  return func();
}

export async function throttle({
  rateLimit,
  canBeIgnored,
  now,
  acquireLock,
  releaseLock,
  getTimestamps,
  addTimestamp,
  removeTimestamp,
}: {
  rateLimit: RateLimit;
  canBeIgnored: boolean;
  now: number;
  acquireLock: () => Promise<void>;
  releaseLock: () => Promise<void>;
  getTimestamps: () => Promise<number[]>;
  addTimestamp: (timestamp: number) => Promise<void>;
  removeTimestamp: (timestamp: number) => Promise<void>;
}): Promise<{ delay: number | undefined; skip: boolean }> {
  await acquireLock();

  try {
    // Get timestamps data.
    const rawTimestamps = await getTimestamps();

    // Trim anything older than the window in ms
    const windowStart = now - rateLimit.windowInMs;
    const timestamps = rawTimestamps.filter((timestamp) => {
      return timestamp > windowStart;
    });

    // Remove the expired timestamps entries.
    const diff = _.difference(rawTimestamps, timestamps);
    for (const timestamp of diff) {
      await removeTimestamp(timestamp);
    }

    // Check if the list of timestamps is less than the rate limit.
    if (timestamps.length < rateLimit.limit) {
      // Add the current timestamp to the timestamps
      await addTimestamp(now);
      return { delay: 0, skip: false }; // OK
    } else {
      if (canBeIgnored) {
        return { delay: undefined, skip: true }; // The caller said the request can be ignored, we don't add it and we indicate that the request can be ignored.
      }

      // Sort timestamps first just in case (they should be sorted already)
      const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
      const lastEntryInWindow =
        sortedTimestamps[timestamps.length - rateLimit.limit];

      // This should never happen since we checked timestamps.length >= rateLimit.limit above
      if (lastEntryInWindow === undefined) {
        throw new Error(
          "Unexpected: no timestamp found at calculated index when timestamps array should not be empty"
        );
      }

      const nextEntryTimestamp = lastEntryInWindow + rateLimit.windowInMs;

      const delay = nextEntryTimestamp - now;

      // Add the future timestamp when the request will be allowed
      await addTimestamp(nextEntryTimestamp);

      return { delay: Math.max(0, delay), skip: false };
    }
  } finally {
    await releaseLock();
  }
}

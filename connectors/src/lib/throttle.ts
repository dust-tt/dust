import _ from "lodash";

import { redisClient } from "@connectors/lib/redis";
import logger from "@connectors/logger/logger";

export async function throttleWithRedis<T>(
  rateLimitPerMinute: number,
  key: string,
  canBeIgnored: boolean,
  func: () => Promise<T>
): Promise<T | undefined> {
  const client = await redisClient({ origin: "throttle" });
  const redisKey = `throttle:${key}`;
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

  const delay = await throttle({
    rateLimitPerMinute,
    canBeIgnored,
    now: new Date().getTime(),
    getTimestamps,
    addTimestamp,
    removeTimestamp,
  });

  if (delay === -1) {
    // Ignore the request
    return;
  } else if (delay > 0) {
    logger.info({ delay }, "Delaying api request");
    await new Promise((resolve) => setTimeout(resolve, delay));
  } else if (delay === 0) {
    // Do nothing and just call the function
  } else {
    throw new Error("Invalid delay");
  }

  return func();
}

export async function throttle({
  rateLimitPerMinute,
  canBeIgnored,
  now,
  getTimestamps,
  addTimestamp,
  removeTimestamp,
}: {
  rateLimitPerMinute: number;
  canBeIgnored: boolean;
  now: number;
  getTimestamps: () => Promise<number[]>;
  addTimestamp: (timestamp: number) => Promise<void>;
  removeTimestamp: (timestamp: number) => Promise<void>;
}): Promise<number> {
  // Reduce to 90% of the rate limit per minute as a safety margin.
  const allowedRequestsPerMinute = Math.floor(rateLimitPerMinute * 0.9);

  // Handle edge case where rate limit is so low that 90% margin results in 0 allowed requests
  if (allowedRequestsPerMinute === 0) {
    throw new Error(
      `Rate limit too low: ${rateLimitPerMinute} requests per minute results in 0 allowed requests after applying 90% safety margin. Consider using a higher rate limit (minimum 2 requests per minute recommended).`
    );
  }

  // Get timestamps data.
  const rawTimestamps = await getTimestamps();

  // Trim anything older than 1 minute in data.
  const oneMinuteAgo = now - 60 * 1000;
  const timestamps = rawTimestamps.filter((timestamp) => {
    return timestamp > oneMinuteAgo;
  });

  // Remove the expired timestamps entries.
  const diff = _.difference(rawTimestamps, timestamps);
  for (const timestamp of diff) {
    await removeTimestamp(timestamp);
  }

  // Check if the list of timestamps is less than the rate limit per minute.
  if (timestamps.length < allowedRequestsPerMinute) {
    // Add the current timestamp to the timestamps
    await addTimestamp(now);
    return 0; // OK
  } else {
    if (canBeIgnored) {
      return -1; // The caller said the request can be ignored, we don't add it and we return -1 to indicate that the request can be ignored.
    }

    // Sort timestamps first just in case (they should be sorted already)
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    const lastEntryInWindow =
      sortedTimestamps[timestamps.length - allowedRequestsPerMinute];

    // This should never happen since we checked timestamps.length >= allowedRequestsPerMinute above
    if (lastEntryInWindow === undefined) {
      throw new Error(
        "Unexpected: no timestamp found at calculated index when timestamps array should not be empty"
      );
    }

    const nextEntryTimestamp = lastEntryInWindow + 60 * 1000;

    const delay = nextEntryTimestamp - now;

    // Add the future timestamp when the request will be allowed
    await addTimestamp(nextEntryTimestamp);

    return Math.max(0, delay);
  }
}

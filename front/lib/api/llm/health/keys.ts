import { WINDOW_MINUTES } from "@app/lib/api/llm/health/config";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import assert from "assert";

const KEY_PREFIX = "mh";

export const ATTEMPTS_FIELD = "attempts";

export const PROVIDER_ERRORS_FIELD = "error_provider";

/** `yyyymmddHHMM` in UTC. */
export function minuteBucket(date: Date): string {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

/** The `WINDOW_MINUTES` buckets ending at (and including) `now`. */
export function windowMinuteBuckets(now: Date): string[] {
  const buckets: string[] = [];
  for (let i = WINDOW_MINUTES - 1; i >= 0; i--) {
    buckets.push(minuteBucket(new Date(now.getTime() - i * 60 * 1000)));
  }
  return buckets;
}

export function modelHealthKey(
  { modelId, providerId, host }: DegradedModelEndpointType,
  bucket: string
): string {
  // Fireworks model ids keep their `accounts/fireworks/models/` prefix, which is
  // fine in a Redis key. A colon would not be: it is the segment separator, so a
  // key containing one could not be read back apart.
  assert(
    !modelId.includes(":") && !providerId.includes(":") && !host.includes(":"),
    `Model health key segments must not contain ":": ${modelId}/${providerId}/${host}`
  );

  return `${KEY_PREFIX}:${providerId}:${modelId}:${host}:${bucket}`;
}

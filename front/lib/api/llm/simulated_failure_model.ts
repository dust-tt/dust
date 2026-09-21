import {
  applyDegradedEndpointCacheUpdate,
  getDegradedModelIds,
} from "@app/lib/api/assistant/degraded_models";
import {
  ERROR_RATIO_THRESHOLD,
  MIN_ATTEMPTS_IN_WINDOW,
} from "@app/lib/api/llm/health/config";
import {
  ATTEMPTS_FIELD,
  minuteBucket,
  modelHealthKey,
  PROVIDER_ERRORS_FIELD,
  windowMinuteBuckets,
} from "@app/lib/api/llm/health/keys";
import type { ModelHealthWindowType } from "@app/lib/api/llm/health/types";
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import { runOnRedisCache } from "@app/lib/api/redis";
import { OPENAI_RESPONSES_HOST } from "@app/lib/model_constructors/types/hosts";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import {
  SIMULATED_FAILURE_MODEL_CONFIG,
  SIMULATED_FAILURE_MODEL_ID,
} from "@app/types/assistant/models/simulated_failure_model";

export const SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS = 15 * 60;

export const SIMULATED_FAILURE_MODEL_ENDPOINT = {
  modelId: SIMULATED_FAILURE_MODEL_ID,
  providerId: SIMULATED_FAILURE_MODEL_CONFIG.providerId,
  host: OPENAI_RESPONSES_HOST,
} as const;

const SEEDED_WINDOW: ModelHealthWindowType = {
  attempts: MIN_ATTEMPTS_IN_WINDOW - 1,
  providerErrors: Math.ceil(MIN_ATTEMPTS_IN_WINDOW * ERROR_RATIO_THRESHOLD) - 1,
};

function isSeededWindow(window: ModelHealthWindowType): boolean {
  return (
    window.attempts === SEEDED_WINDOW.attempts &&
    window.providerErrors === SEEDED_WINDOW.providerErrors
  );
}

function boundTtlSeconds(ttlSeconds: number): number {
  return Math.max(
    1,
    Math.min(ttlSeconds, SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS)
  );
}

/**
 * @cc [owner:frankaloia,label:testing;error-handling] real-health-threshold-seed
 * Seeding MUST only touch the synthetic endpoint's current health window and MUST leave it one
 * provider-attributed failure below the production breach threshold, so an actual injected 503
 * crosses the threshold through `recordLLMAttempt`.
 */
export async function seedSimulatedFailureModelHealthWindow(
  now: Date = new Date(),
  ttlSeconds: number = SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS
): Promise<void> {
  const buckets = windowMinuteBuckets(now);
  const currentKey = modelHealthKey(
    SIMULATED_FAILURE_MODEL_ENDPOINT,
    minuteBucket(now)
  );

  await runOnRedisCache({ origin: "model_health" }, async (redis) => {
    const multi = redis.multi();
    for (const bucket of buckets) {
      multi.del(modelHealthKey(SIMULATED_FAILURE_MODEL_ENDPOINT, bucket));
    }
    multi.hSet(currentKey, {
      [ATTEMPTS_FIELD]: String(SEEDED_WINDOW.attempts),
      [PROVIDER_ERRORS_FIELD]: String(SEEDED_WINDOW.providerErrors),
    });
    multi.expire(currentKey, boundTtlSeconds(ttlSeconds));
    await multi.exec();
  });
}

export async function clearSimulatedFailureModelHealthWindow(
  now: Date = new Date()
): Promise<void> {
  await runOnRedisCache({ origin: "model_health" }, async (redis) => {
    const multi = redis.multi();
    for (const bucket of windowMinuteBuckets(now)) {
      multi.del(modelHealthKey(SIMULATED_FAILURE_MODEL_ENDPOINT, bucket));
    }
    await multi.exec();
  });
}

async function seedTtlSeconds(now: Date): Promise<number | null> {
  return runOnRedisCache({ origin: "model_health" }, async (redis) => {
    let remainingSeconds: number | null = null;
    for (const bucket of windowMinuteBuckets(now)) {
      const ttlSeconds = await redis.ttl(
        modelHealthKey(SIMULATED_FAILURE_MODEL_ENDPOINT, bucket)
      );
      if (ttlSeconds > 0) {
        remainingSeconds =
          remainingSeconds === null
            ? ttlSeconds
            : Math.max(remainingSeconds, ttlSeconds);
      }
    }
    return remainingSeconds;
  });
}

/**
 * Whether the breaker (or an operator) has already marked this endpoint
 * degraded. Conversation streams 503 until that flag exists; recovery probes
 * see it and call the cheap delegate instead.
 *
 * The in-memory set is enough on a pod that just wrote the row. A Temporal
 * worker may not have it yet, so a cache miss falls through to one row read.
 */
export async function isSimulatedFailureModelDegraded(): Promise<boolean> {
  if (getDegradedModelIds().has(SIMULATED_FAILURE_MODEL_ID)) {
    return true;
  }

  const degradation = await ModelDegradationResource.fetchByEndpoint(
    SIMULATED_FAILURE_MODEL_ENDPOINT
  );
  if (!degradation) {
    return false;
  }

  applyDegradedEndpointCacheUpdate([
    { modelId: SIMULATED_FAILURE_MODEL_ID, degraded: true },
  ]);
  return true;
}

export async function getSimulatedFailureModelStatus(): Promise<{
  failureEnabled: boolean;
  degradation: "none" | "lease" | "permanent";
  ttlSeconds: number | null;
  healthWindow: ModelHealthWindowType;
}> {
  const now = new Date();
  const [degradation, healthWindow, ttlSeconds] = await Promise.all([
    ModelDegradationResource.fetchByEndpoint(SIMULATED_FAILURE_MODEL_ENDPOINT),
    readEndpointWindow(SIMULATED_FAILURE_MODEL_ENDPOINT, now),
    seedTtlSeconds(now),
  ]);

  return {
    failureEnabled: isSeededWindow(healthWindow),
    degradation: !degradation
      ? "none"
      : degradation.expiresAt
        ? "lease"
        : "permanent",
    ttlSeconds,
    healthWindow,
  };
}

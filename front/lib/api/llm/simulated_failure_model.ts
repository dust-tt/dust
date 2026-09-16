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
import { readEndpointWindow } from "@app/lib/api/llm/health/window";
import { runOnRedisCache } from "@app/lib/api/redis";
import { OPENAI_RESPONSES_HOST } from "@app/lib/model_constructors/types/hosts";
import { ModelDegradationResource } from "@app/lib/resources/model_degradation_resource";
import logger from "@app/logger/logger";
import {
  SIMULATED_FAILURE_MODEL_CONFIG,
  SIMULATED_FAILURE_MODEL_ID,
} from "@app/types/assistant/models/simulated_failure_model";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const SIMULATED_FAILURE_MODEL_KEY = "simulated-failure-model:v1:failure";
export const SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS = 15 * 60;

type SimulatedFailureModelFailureState = "armed" | "triggered";

export const SIMULATED_FAILURE_MODEL_ENDPOINT = {
  modelId: SIMULATED_FAILURE_MODEL_ID,
  providerId: SIMULATED_FAILURE_MODEL_CONFIG.providerId,
  host: OPENAI_RESPONSES_HOST,
} as const;

async function readFailureState(): Promise<SimulatedFailureModelFailureState | null> {
  try {
    const value = await runOnRedisCache(
      { origin: "simulated_failure_model" },
      (redis) => redis.get(SIMULATED_FAILURE_MODEL_KEY)
    );
    return value === "armed" || value === "triggered" ? value : null;
  } catch (err) {
    logger.error(
      { err: normalizeError(err), synthetic: true },
      "Failed to read simulated failure model state"
    );
    return null;
  }
}

/**
 * @cc [owner:frankaloia,label:security;testing] fail-closed-synthetic-model
 * Missing, invalid, expired, stopped, or unreadable Redis state MUST keep the synthetic model
 * healthy. Enabling failure MUST expire within `SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS`.
 * Disabling failure MUST NOT clear breaker-owned automatic degradation.
 */
export async function setSimulatedFailureModelFailure({
  enabled,
  ttlSeconds,
}: {
  enabled: boolean;
  ttlSeconds: number;
}): Promise<void> {
  if (!enabled) {
    await runOnRedisCache({ origin: "simulated_failure_model" }, (redis) =>
      redis.del(SIMULATED_FAILURE_MODEL_KEY)
    );
    return;
  }

  const boundedTtlSeconds = Math.max(
    1,
    Math.min(ttlSeconds, SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS)
  );
  await runOnRedisCache({ origin: "simulated_failure_model" }, (redis) =>
    redis.set(SIMULATED_FAILURE_MODEL_KEY, "armed", {
      EX: boundedTtlSeconds,
    })
  );
}

/**
 * @cc [owner:frankaloia,label:testing;error-handling] real-health-threshold-seed
 * Seeding MUST only touch the synthetic endpoint's current health window and MUST leave it one
 * provider-attributed failure below the production breach threshold, so an actual injected 503
 * crosses the threshold through `recordLLMAttempt`.
 */
export async function seedSimulatedFailureModelHealthWindow(
  now: Date = new Date()
): Promise<void> {
  const buckets = windowMinuteBuckets(now);
  const currentKey = modelHealthKey(
    SIMULATED_FAILURE_MODEL_ENDPOINT,
    minuteBucket(now)
  );
  const providerErrorsBeforeBreach =
    Math.ceil(MIN_ATTEMPTS_IN_WINDOW * ERROR_RATIO_THRESHOLD) - 1;

  await runOnRedisCache(
    { origin: "simulated_failure_model" },
    async (redis) => {
      const multi = redis.multi();
      for (const bucket of buckets) {
        multi.del(modelHealthKey(SIMULATED_FAILURE_MODEL_ENDPOINT, bucket));
      }
      multi.hSet(currentKey, {
        [ATTEMPTS_FIELD]: String(MIN_ATTEMPTS_IN_WINDOW - 1),
        [PROVIDER_ERRORS_FIELD]: String(providerErrorsBeforeBreach),
      });
      multi.expire(currentKey, SIMULATED_FAILURE_MODEL_MAX_TTL_SECONDS);
      await multi.exec();
    }
  );
}

/**
 * Called by the synthetic endpoint immediately before it emits its injected
 * 503. Degradation is deliberately left to the normal attempt telemetry,
 * detector, and recovery workflow.
 */
export async function triggerSimulatedFailureModelFailure(): Promise<boolean> {
  const state = await readFailureState();
  if (!state) {
    return false;
  }

  if (state === "armed") {
    try {
      await runOnRedisCache({ origin: "simulated_failure_model" }, (redis) =>
        redis.set(SIMULATED_FAILURE_MODEL_KEY, "triggered", {
          KEEPTTL: true,
          XX: true,
        })
      );
    } catch (err) {
      logger.error(
        { err: normalizeError(err), synthetic: true },
        "Failed to mark simulated failure model as triggered"
      );
    }
  }

  return true;
}

export async function getSimulatedFailureModelStatus(): Promise<{
  failureEnabled: boolean;
  failureTriggered: boolean;
  // "lease" while the breaker holds the endpoint out of routing, "permanent"
  // when an operator row does.
  degradation: "none" | "lease" | "permanent";
  ttlSeconds: number | null;
  healthWindow: {
    attempts: number;
    providerErrors: number;
  };
}> {
  const [state, observedExpiration, ttlSeconds, healthWindow] =
    await Promise.all([
      readFailureState(),
      ModelDegradationResource.getObservedExpiration(
        SIMULATED_FAILURE_MODEL_ENDPOINT
      ),
      runOnRedisCache({ origin: "simulated_failure_model" }, (redis) =>
        redis.ttl(SIMULATED_FAILURE_MODEL_KEY)
      ),
      readEndpointWindow(SIMULATED_FAILURE_MODEL_ENDPOINT, new Date()),
    ]);

  return {
    failureEnabled: state !== null,
    failureTriggered: state === "triggered",
    degradation:
      observedExpiration === null
        ? "none"
        : observedExpiration === "permanent"
          ? "permanent"
          : "lease",
    ttlSeconds: ttlSeconds >= 0 ? ttlSeconds : null,
    healthWindow,
  };
}

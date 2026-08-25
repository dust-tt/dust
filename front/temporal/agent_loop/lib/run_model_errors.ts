import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { ApplicationFailure } from "@temporalio/common";

const RUN_MODEL_LLM_ERROR_TYPE_SEPARATOR = ":";

const RUN_MODEL_LLM_ERROR_TYPE_PREFIX = "RunModelLLMError";

const RUN_MODEL_LLM_UNRESPONSIVE_ERROR_TYPES = new Set<LLMErrorType>([
  "llm_timeout_error",
  "timeout_error",
]);

const MODEL_INTERRUPTION_ERROR_TYPE = "ModelInterruption";

const MODEL_FAILOVER_ERROR_TYPE = "ModelFailover";

// Same pattern as makeToolInterruptionError: a retryable failure so Temporal reruns the step on
// another worker when the current one is shutting down.
export function makeModelInterruptionError(): ApplicationFailure {
  return ApplicationFailure.retryable(
    "Model activity interrupted by worker shutdown",
    MODEL_INTERRUPTION_ERROR_TYPE
  );
}

export function makeRunModelLLMError({
  type,
  message,
}: {
  type: LLMErrorType;
  message: string;
}): ApplicationFailure {
  return ApplicationFailure.retryable(
    `LLM error (${type}): ${message}`,
    makeRunModelLLMErrorType(type)
  );
}

function makeRunModelLLMErrorType(type: LLMErrorType): string {
  return [RUN_MODEL_LLM_ERROR_TYPE_PREFIX, type].join(
    RUN_MODEL_LLM_ERROR_TYPE_SEPARATOR
  );
}

export function isRunModelLLMUnresponsiveFailureType(
  failureType: string | null | undefined
): boolean {
  const prefix = `${RUN_MODEL_LLM_ERROR_TYPE_PREFIX}${RUN_MODEL_LLM_ERROR_TYPE_SEPARATOR}`;

  if (!failureType?.startsWith(prefix)) {
    return false;
  }

  const llmErrorType = failureType.slice(prefix.length);

  return RUN_MODEL_LLM_UNRESPONSIVE_ERROR_TYPES.has(
    llmErrorType as LLMErrorType
  );
}

/**
 * Signals that an auto-stream message exhausted its retries on a provider-side error and has been
 * moved to the next model of its stream (already persisted on the agent message). Non-retryable on
 * purpose: the current activity has no attempts left, so the workflow catches this and starts a
 * fresh activity, which reads the new model and gets a full retry budget for it.
 */
export function makeModelFailoverError(message: string): ApplicationFailure {
  return ApplicationFailure.nonRetryable(message, MODEL_FAILOVER_ERROR_TYPE);
}

export function isModelFailoverFailureType(
  failureType: string | null | undefined
): boolean {
  return failureType === MODEL_FAILOVER_ERROR_TYPE;
}

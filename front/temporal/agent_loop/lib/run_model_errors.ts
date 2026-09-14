import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { ApplicationFailure } from "@temporalio/common";

const RUN_MODEL_LLM_ERROR_TYPE_SEPARATOR = ":";

const RUN_MODEL_LLM_ERROR_TYPE_PREFIX = "RunModelLLMError";

const RUN_MODEL_LLM_UNRESPONSIVE_ERROR_TYPES = new Set<LLMErrorType>([
  "llm_timeout_error",
  "timeout_error",
]);

const MODEL_INTERRUPTION_ERROR_TYPE = "ModelInterruption";

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

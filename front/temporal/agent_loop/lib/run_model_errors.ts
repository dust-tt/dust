import type { LLMErrorType } from "@app/lib/api/llm/types/errors";
import { ApplicationFailure } from "@temporalio/common";

const RUN_MODEL_LLM_ERROR_TYPE_SEPARATOR = ":";

export const RUN_MODEL_LLM_ERROR_TYPE_PREFIX = "RunModelLLMError";

const RUN_MODEL_LLM_UNRESPONSIVE_ERROR_TYPES = new Set<LLMErrorType>([
  "llm_timeout_error",
  "timeout_error",
]);

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

import {
  GPT_5_6_LUNA_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
} from "./openai";
import type { ModelConfigurationType } from "./types";
import { ResponseFormatSchema } from "./types";

const IMPROVED_ZOD_ERROR_MESSAGES = new Map<string, string>([
  ["Required", "Missing required field"],
]);

export type ResponseFormatValidationResult =
  | { isValid: true }
  | { isValid: false; errorMessage: string };

export function getModelMaxInputTokens(
  model: Pick<
    ModelConfigurationType,
    "modelId" | "contextSize" | "generationTokensCount"
  >,
  contextSizeTokens = model.contextSize
): number {
  switch (model.modelId) {
    // GPT 5.6 contextSize is capped as a max-input limit. Its separate output
    // allowance must not be reserved from that limit a second time.
    case GPT_5_6_SOL_MODEL_ID:
    case GPT_5_6_TERRA_MODEL_ID:
    case GPT_5_6_LUNA_MODEL_ID:
      return contextSizeTokens;
    default:
      return Math.max(0, contextSizeTokens - model.generationTokensCount);
  }
}

export function validateResponseFormat(
  value: string
): ResponseFormatValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { isValid: false, errorMessage: "Invalid JSON." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { isValid: false, errorMessage: "Must be a JSON object." };
  }

  const result = ResponseFormatSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message =
      IMPROVED_ZOD_ERROR_MESSAGES.get(firstIssue.message) ?? firstIssue.message;
    const field =
      firstIssue.path.length > 0 ? ` Field: ${firstIssue.path.join(".")}` : "";
    return {
      isValid: false,
      errorMessage: `Invalid JSON format: ${message}.${field}`,
    };
  }

  return { isValid: true };
}

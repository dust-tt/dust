import { ResponseFormatSchema } from "./types";

const IMPROVED_ZOD_ERROR_MESSAGES = new Map<string, string>([
  ["Required", "Missing required field"],
]);

export type ResponseFormatValidationResult =
  | { isValid: true }
  | { isValid: false; errorMessage: string };

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

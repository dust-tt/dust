export const CIRCLE_BACK_TO_CONVERSATION_TOOL_NAME =
  "circle_back_to_conversation";

export type DelayUnit = "seconds" | "minutes" | "hours" | "days";

// Minimum and maximum delays
export const MIN_DELAY_MS = 10 * 1000; // 10 seconds
export const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Converts a delay value and unit to milliseconds
 */
export function delayToMs(value: number, unit: DelayUnit): number {
  switch (unit) {
    case "seconds":
      return value * 1000;
    case "minutes":
      return value * 60 * 1000;
    case "hours":
      return value * 60 * 60 * 1000;
    case "days":
      return value * 24 * 60 * 60 * 1000;
  }
}

/**
 * Validates that a delay is within allowed bounds
 */
export function validateDelay(delayMs: number): {
  valid: boolean;
  error?: string;
} {
  if (delayMs < MIN_DELAY_MS) {
    return {
      valid: false,
      error: `Delay must be at least 10 seconds (${MIN_DELAY_MS}ms). Got ${delayMs}ms.`,
    };
  }
  if (delayMs > MAX_DELAY_MS) {
    return {
      valid: false,
      error: `Delay must be at most 30 days (${MAX_DELAY_MS}ms). Got ${delayMs}ms.`,
    };
  }
  return { valid: true };
}

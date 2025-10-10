/**
 * Shared utilities for token calculation and management
 */

import { tokenCountForTexts } from "@app/lib/tokenization";
import type { ModelConfigurationType } from "@app/types";

// Token count for pruned tool results
export const PRUNED_TOOL_RESULT_TOKENS = 20;

// Placeholder text for pruned results
export const PRUNED_RESULT_PLACEHOLDER =
  "<dust_system>This function result is no longer available.</dust_system>";

/**
 * Calculate tokens for a text string
 */
export async function calculateTokens(
  text: string,
  model: ModelConfigurationType
): Promise<number> {
  const res = await tokenCountForTexts([text], model);
  if (res.isErr()) {
    throw res.error;
  }
  return res.value[0];
}
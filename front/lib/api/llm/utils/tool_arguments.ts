import isObject from "lodash/isObject";

import logger from "@app/logger/logger";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

/**
 * Fixes GPT-5 Unicode corruption where \u00XX is encoded as \u0000XX.
 * In JSON strings, this appears as literal "\u0000" followed by two hex digits.
 *
 * Examples in JSON:
 * - "\\u0000e9" should be "\\u00e9" (é)
 * - "\\u0000e0" should be "\\u00e0" (à)
 *
 * Known issue affecting GPT-5 and GPT-4o models:
 * - GPT-5 streaming tool calls: https://community.openai.com/t/gpt-5-api-outputs-garbled-arguments-when-streaming-tool-calls/1364669
 * - GPT-4o Unicode corruption: https://community.openai.com/t/gpt-4o-returning-malformed-unicode-like-u0000e6-instead-of-ae-encoding-bug/1323897
 */
function fixCorruptedUnicodeInJSON(jsonString: string): string {
  // Match the JSON escape sequence \u0000 followed by two hex digits
  return jsonString.replace(/\\u0000([0-9a-fA-F]{2})/g, (_match, hex) => {
    const codePoint = parseInt(hex, 16);
    // Only fix if it maps to a Latin-1 Supplement character (0x80-0xFF)
    // This avoids false positives with ASCII range (0x00-0x7F)
    if (codePoint >= 0x80 && codePoint <= 0xff) {
      return `\\u00${hex}`;
    }
    return _match; // Leave unchanged if outside target range
  });
}

export const parseToolArguments = (
  input: string,
  toolName: string
): Record<string, unknown> => {
  if (input.trim() === "") {
    return {};
  }

  // Always fix corrupted Unicode in the JSON string before parsing
  // This is safe as we only fix Latin-1 Supplement characters (0x80-0xFF)
  const processedInput = fixCorruptedUnicodeInJSON(input);

  if (processedInput !== input) {
    logger.warn(
      {toolName, input, processedInput},
      "Fixed corrupted Unicode in tool arguments."
    );
  }

  const parsed = safeParseJSON(processedInput);
  if (parsed.isErr()) {
    throw new Error(
      `Failed to parse arguments in call to tool '${toolName}': ${parsed.error}`
    );
  }
  if (!isObject(parsed.value) || !parsed.value || Array.isArray(parsed.value)) {
    throw new Error(
      `Tool call arguments must be an object and not undefined, got ${typeof parsed.value}. Tool is '${toolName}'.`
    );
  }

  return parsed.value as Record<string, unknown>;
};

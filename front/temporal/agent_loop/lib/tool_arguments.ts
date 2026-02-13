/**
 * Fixes GPT-5 Unicode corruption where \u00XX is encoded as \u0000XX.
 * After JSON parsing, this appears as a null byte (U+0000) followed by two hex digit characters.
 *
 * Examples of corruption:
 * - "\u0000e9" (null + "e9") should be "\u00e9" (é)
 * - "\u0000e0" (null + "e0") should be "\u00e0" (à)
 *
 * Only fixes characters in the Latin-1 Supplement range (U+0080 to U+00FF) to avoid
 * false positives with ASCII characters (U+0000 to U+007F).
 *
 * Known issue affecting GPT-5 and GPT-4o models:
 * - GPT-5 streaming tool calls: https://community.openai.com/t/gpt-5-api-outputs-garbled-arguments-when-streaming-tool-calls/1364669
 * - GPT-4o Unicode corruption: https://community.openai.com/t/gpt-4o-returning-malformed-unicode-like-u0000e6-instead-of-ae-encoding-bug/1323897
 */
export function fixCorruptedUnicode(input: string): string {
  // eslint-disable-next-line no-control-regex -- Intentionally matching null bytes (U+0000) for GPT-5 corruption fix
  return input.replace(/\x00([0-9a-fA-F]{2})/g, (_match, hex) => {
    const codePoint = parseInt(hex, 16);
    // Only fix if it maps to a Latin-1 Supplement character (0x80-0xFF)
    // This avoids false positives with ASCII range (0x00-0x7F)
    if (codePoint >= 0x80 && codePoint <= 0xff) {
      return String.fromCharCode(codePoint);
    }
    return _match; // Leave unchanged if outside target range
  });
}

/**
 * Browser-safe assert function. Throws an Error if the condition is falsy.
 */
export default function assert(
  condition: unknown,
  message?: string
): asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

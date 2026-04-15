import type { DedupAssertion } from "@app/tests/dedup-evals/lib/types";

type AssertionResult = { success: true } | { success: false; error: string };

/**
 * Validate a single dedup assertion against the actual match map.
 */
export function validateDedupAssertion(
  assertion: DedupAssertion,
  matchMap: Map<number, string>
): AssertionResult {
  switch (assertion.type) {
    case "shouldMatchExisting": {
      const actualSId = matchMap.get(assertion.candidateIndex);
      if (!actualSId) {
        return {
          success: false,
          error: `Expected candidate[${assertion.candidateIndex}] to match existing "${assertion.existingSId}", but no match was found (treated as new)`,
        };
      }
      if (actualSId !== assertion.existingSId) {
        return {
          success: false,
          error: `Expected candidate[${assertion.candidateIndex}] to match "${assertion.existingSId}", but it matched "${actualSId}" instead`,
        };
      }
      return { success: true };
    }
    case "shouldBeNew": {
      const actualSId = matchMap.get(assertion.candidateIndex);
      if (actualSId) {
        return {
          success: false,
          error: `Expected candidate[${assertion.candidateIndex}] to be new, but it was matched to "${actualSId}"`,
        };
      }
      return { success: true };
    }
  }
}

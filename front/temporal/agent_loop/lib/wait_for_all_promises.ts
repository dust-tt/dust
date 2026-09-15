/**
 * Wait for every promise to settle, then preserve Promise.all's success and failure contract.
 * This prevents one cancelled activity from letting a workflow finalize while sibling activities
 * are still completing.
 *
 * When several promises reject, the first rejection in input order is thrown. `preferRejection`
 * overrides that order: the first rejection matching the predicate wins, so a swallowable
 * infrastructure timeout cannot mask a sibling's real failure.
 */
export async function waitForAllPromises<T>(
  promises: readonly Promise<T>[],
  { preferRejection }: { preferRejection?: (reason: unknown) => boolean } = {}
): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  const values: T[] = [];
  let firstRejection: PromiseRejectedResult | undefined;
  let firstPreferredRejection: PromiseRejectedResult | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
      continue;
    }
    if (!firstRejection) {
      firstRejection = result;
    }
    if (!firstPreferredRejection && preferRejection?.(result.reason)) {
      firstPreferredRejection = result;
    }
  }

  const rejection = firstPreferredRejection ?? firstRejection;
  if (rejection) {
    throw rejection.reason;
  }

  return values;
}

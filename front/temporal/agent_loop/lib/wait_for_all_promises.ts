/**
 * Wait for every promise to settle, then preserve Promise.all's success and failure contract.
 * This prevents one cancelled activity from letting a workflow finalize while sibling activities
 * are still completing.
 */
export async function waitForAllPromises<T>(
  promises: readonly Promise<T>[]
): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  const values: T[] = [];
  let firstRejection: PromiseRejectedResult | undefined;

  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    } else if (!firstRejection) {
      firstRejection = result;
    }
  }

  if (firstRejection) {
    throw firstRejection.reason;
  }

  return values;
}

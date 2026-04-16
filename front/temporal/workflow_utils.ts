/**
 * Temporal-workflow-safe concurrent executor (inlined to avoid @app/ imports
 * that require bundlerOptions with TsconfigPathsPlugin).
 */
export async function concurrentExecutor<T, V>(
  items: T[] | readonly T[],
  iterator: (item: T, idx: number) => Promise<V>,
  { concurrency }: { concurrency: number }
): Promise<V[]> {
  const results: V[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  async function worker() {
    let work;
    while ((work = queue.shift())) {
      results[work.index] = await iterator(work.item, work.index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

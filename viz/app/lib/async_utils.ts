export async function concurrentExecutor<T, V>(
  items: T[] | readonly T[],
  iterator: (item: T, idx: number) => Promise<V>,
  { concurrency }: { concurrency: number }
): Promise<V[]> {
  const results: V[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await iterator(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

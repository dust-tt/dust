import PQueue from "p-queue";

export async function concurrentExecutor<T, V>(
  items: T[],
  iterator: (item: T, idx: number) => Promise<V>,
  { concurrency = 8 }: { concurrency: number }
) {
  const queue = new PQueue({ concurrency });
  const promises: Promise<V>[] = [];

  for (const [idx, item] of items.entries()) {
    // Queue each task. The queue manages concurrency.
    // Each task is wrapped in a promise to capture its completion.
    const p = queue.add(async () => iterator(item, idx));

    // Cast the promise to Promise<R> to fix the return type from P-Queue.
    promises.push(p as Promise<V>);
  }

  // `Promise.all` will throw at the first rejection, but all tasks will continue to process.
  return Promise.all(promises);
}

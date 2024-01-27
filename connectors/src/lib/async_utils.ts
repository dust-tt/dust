import PQueue from "p-queue";

export async function concurrentExecutor<T>(
  items: T[],
  iterator: (item: T, idx: number) => Promise<void>,
  { concurrency = 8 }: { concurrency: number }
) {
  const queue = new PQueue({ concurrency });

  const promises = [];

  for (const [idx, item] of items.entries()) {
    // Queue each task. The queue manages concurrency.
    // Each task is wrapped in a promise to capture its completion.
    promises.push(queue.add(async () => iterator(item, idx)));
  }

  // `Promise.all` will throw at the first rejection, but all tasks will continue to process.
  return Promise.all(promises);
}

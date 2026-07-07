import PQueue from "p-queue";

export async function concurrentExecutor<T, V>(
  items: T[],
  task: (item: T, idx: number) => Promise<V>,
  {
    concurrency,
    onBatchComplete,
  }: {
    concurrency: number;
    onBatchComplete?: () => Promise<void>;
  }
) {
  const queue = new PQueue({ concurrency });
  const promises: Promise<V>[] = [];

  for (const [idx, item] of items.entries()) {
    // Queue each task. The queue manages concurrency.
    // Each task is wrapped in a promise to capture its completion.
    const p = queue.add(async () => {
      try {
        const result = await task(item, idx);
        return result;
      } finally {
        // Call the onBatchComplete callback if it's provided and the batch is complete
        if (onBatchComplete && (idx + 1) % concurrency === 0) {
          await onBatchComplete();
        }
      }
    });

    // Cast the promise to Promise<V> to fix the return type from P-Queue.
    promises.push(p as Promise<V>);
  }

  // `Promise.all` will throw at the first rejection, but all tasks will continue to process.
  const r = await Promise.all(promises);

  // Call onBatchComplete if callback is provided and the batch is not complete.
  if (onBatchComplete && items.length % concurrency !== 0) {
    await onBatchComplete();
  }

  return r;
}

export const setTimeoutAsync = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getAdaptiveConcurrency(
  files: { size?: number | null }[],
  maxFileSize: number,
  defaultConcurrency: number
): number {
  const maxFoundFileSize = files.reduce((max, file) => {
    // Files with a known size over the limit are skipped before download, so they
    // consume no memory and should not lower concurrency.
    if (file.size && file.size > maxFileSize) {
      return max;
    }
    // Files with an unknown size (e.g. Google-native Docs/Slides, which the Drive
    // API does not report a size for) are treated as worst-case: they can be huge
    // once exported and are fully buffered in memory, so they must not silently
    // get maximum concurrency.
    const effectiveSize = file.size ?? maxFileSize;
    return Math.max(max, effectiveSize);
  }, 0);

  if (maxFoundFileSize === 0) {
    return defaultConcurrency;
  }

  return Math.min(
    Math.floor(maxFileSize / maxFoundFileSize),
    defaultConcurrency
  );
}

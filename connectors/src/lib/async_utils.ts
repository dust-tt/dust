import PQueue from "p-queue";

export async function concurrentExecutor<T>(
  items: T[],
  iterator: (item: T) => Promise<void>,
  { concurrency = 8 }: { concurrency: number }
): Promise<void> {
  const queue = new PQueue({ concurrency });

  // Add all tasks to the queue.
  items.forEach((item) => queue.add(() => iterator(item)));

  // Wait for the queue to be empty (all tasks have been processed)
  await queue.onIdle();
}

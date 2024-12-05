/**
 * Executes an array of tasks concurrently with controlled parallelism.
 *
 * This function processes a list of items concurrently while maintaining a maximum
 * number of parallel executions. It uses a shared queue approach where multiple
 * workers pull items to process, ensuring each item is processed exactly once
 * and results are maintained in the original order.
 *
 * @param items - Array of items to be processed
 * @param iterator - Async function that processes each item. Receives the item and its index
 * @param options.concurrency - Maximum number of parallel executions (default: 8)
 * @returns Promise resolving to array of results in the same order as input items.
 */
export async function concurrentExecutor<T, V>(
  items: T[],
  iterator: (item: T, idx: number) => Promise<V>,
  { concurrency = 8 }: { concurrency: number }
) {
  const results: V[] = new Array(items.length);

  // Initialize queue with work items, preserving original index.
  // This queue is shared between all workers.
  const queue = items.map((item, index) => ({ item, index }));

  /**
   * Worker function that continuously processes items from the shared queue.
   * Multiple instances of this worker run concurrently, each competing
   * for the next available item in the queue. When the queue is empty,
   * the worker terminates.
   *
   * The queue.shift() operation is atomic in JavaScript, ensuring
   * each item is processed exactly once across all workers.
   */
  async function worker() {
    let work;

    // Continue processing while there are items in the queue.
    while ((work = queue.shift())) {
      const result = await iterator(work.item, work.index);
      results[work.index] = result;
    }
  }

  // Create and start workers, limiting the number to either the concurrency
  // limit or the number of items, whichever is smaller. All workers share
  // the same queue and results array.
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

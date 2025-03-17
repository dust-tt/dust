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
export declare function concurrentExecutor<T, V>(items: T[], iterator: (item: T, idx: number) => Promise<V>, { concurrency }: {
    concurrency: number;
}): Promise<V[]>;
//# sourceMappingURL=async_utils.d.ts.map
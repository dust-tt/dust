import { AsyncLocalStorage } from "node:async_hooks";

export interface QueryTrackerStore {
  concurrent: number;
  peak: number;
}

/**
 * Tracks the peak number of concurrent Sequelize queries within a single request.
 *
 * Usage:
 * - `withLogging` wraps each request handler in `queryTracker.run(store, ...)`.
 * - `SequelizeWithComments.query()` increments/decrements `store.concurrent` around
 *   every query and updates `store.peak`.
 * - At request completion, `store.peak` is logged as `peakConcurrentQueries` to help
 *   identify endpoints that hold many connections simultaneously.
 */
export const queryTracker = new AsyncLocalStorage<QueryTrackerStore>();

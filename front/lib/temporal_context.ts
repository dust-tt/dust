import { AsyncLocalStorage } from "async_hooks";

/**
 * Context information from Temporal workflows/activities
 */
export interface TemporalContext {
  workflowName: string;
  workflowId: string;
  activityName?: string;
}

/**
 * AsyncLocalStorage to propagate Temporal workflow context to nested operations,
 * particularly for SQL query comment injection.
 *
 * This allows database queries executed within Temporal activities to be tagged
 * with workflow information without explicit parameter passing.
 */
export const temporalContext = new AsyncLocalStorage<TemporalContext>();

/**
 * Get the current Temporal context if available
 */
export function getTemporalContext(): TemporalContext | undefined {
  return temporalContext.getStore();
}

/**
 * Shared defaults for reinforced agent workflow.
 * These are semi-arbitrary defaults that can be tuned to optimize the workflow for a given use case.
 */

// Max conversations sampled per agent
export const DEFAULT_MAX_CONVERSATIONS_PER_AGENT = 50;
// Minimum number of conversations to include an agent in the selection
export const DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE = 5;
// Agents are only considered for reinforcement selection if they have a pending suggestion that is older than this
export const DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS = 30;
// Total number of conversations to analyze across all auto-mode agents in one run
export const DEFAULT_TOTAL_CONVERSATIONS_TO_ANALYZE = 300;
// Max number of auto-mode agents selected in one run
export const DEFAULT_MAX_AUTO_AGENTS_PER_RUN = 10;

/**
 * Lookback window (days) for agent activity
 *
 * TODO(https://github.com/dust-tt/tasks/issues/7313): This will be replace with a more dynamic window using last reinforcement analysis time
 */
export const DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS = 1;

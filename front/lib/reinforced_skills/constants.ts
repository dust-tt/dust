/**
 * Shared defaults for reinforced skills workflow.
 */

// Max conversations to analyze per workspace run.
export const DEFAULT_MAX_CONVERSATIONS_PER_RUN = 300;

// Default lookback window (days) for conversation discovery.
export const DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS = 1;

// Max number of steps in a multi-step analysis or aggregation loop.
export const MAX_REINFORCED_ANALYSIS_STEPS = 4;

// Maximum concurrent conversation analyses (streaming mode).
export const CONVERSATION_ANALYSIS_CONCURRENCY = 4;

// Maximum concurrent per-skill aggregations.
export const SKILL_AGGREGATION_CONCURRENCY = 8;

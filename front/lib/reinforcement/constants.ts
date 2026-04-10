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

// --- Conversation scoring constants ---

// Skills not modified within this window are excluded from reinforcement.
export const SKILL_STALENESS_THRESHOLD_DAYS = 14;

// Skills with pending reinforcement suggestions younger than this are excluded.
export const PENDING_SUGGESTION_MAX_AGE_DAYS = 30;

// Max conversations analyzed per skill in a single run.
export const PER_SKILL_CONVERSATION_CAP = 20;

// Scoring weights for conversation selection.
export const WEIGHT_FEEDBACK = 0.45;
export const WEIGHT_TOOL_ERRORS = 0.3;
export const WEIGHT_USER_ENGAGEMENT = 0.25;

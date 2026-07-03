export function isSequelizeForeignKeyConstraintError(err: unknown) {
  return (
    err instanceof Error && err.name === "SequelizeForeignKeyConstraintError"
  );
}

/**
 * Purge run executions logic.
 */

export function getHardDeleteScheduleId() {
  return "hard-delete-schedule";
}

export const RUN_EXECUTIONS_RETENTION_DAYS_THRESHOLD = 30;

export function getRunExecutionsDeletionCutoffDate(): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(
    cutoffDate.getDate() - RUN_EXECUTIONS_RETENTION_DAYS_THRESHOLD
  );

  return cutoffDate.getTime();
}

/**
 * Purge pending agents logic.
 */

export const PENDING_AGENTS_RETENTION_HOURS = 72;

export function getPendingAgentsDeletionCutoffDate(): Date {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - PENDING_AGENTS_RETENTION_HOURS);

  return cutoffDate;
}

/**
 * Purge draft agents logic.
 */

export const DRAFT_AGENTS_RETENTION_DAYS = 7;

export function getDraftAgentsDeletionCutoffDate(): Date {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DRAFT_AGENTS_RETENTION_DAYS);

  return cutoffDate;
}

/**
 * Purge synthetic agent suggestions logic.
 */

export const SYNTHETIC_SUGGESTIONS_RETENTION_DAYS = 14;

export function getSyntheticSuggestionsDeletionCutoffDate(): Date {
  const cutoffDate = new Date();
  cutoffDate.setDate(
    cutoffDate.getDate() - SYNTHETIC_SUGGESTIONS_RETENTION_DAYS
  );

  return cutoffDate;
}

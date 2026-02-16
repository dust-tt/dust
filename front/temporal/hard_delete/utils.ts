export function isSequelizeForeignKeyConstraintError(err: unknown) {
  return (
    err instanceof Error && err.name === "SequelizeForeignKeyConstraintError"
  );
}

/**
 * Purge run executions logic.
 */

export function getPurgeRunExecutionsScheduleId() {
  return "purge-run-executions-schedule";
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

export const PENDING_AGENTS_RETENTION_HOURS = 24;

export function getPendingAgentsDeletionCutoffDate(): Date {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - PENDING_AGENTS_RETENTION_HOURS);

  return cutoffDate;
}

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

const RUN_EXECUTIONS_RETENTION_DAYS_THRESHOLD = 30;

export function getRunExecutionsDeletionCutoffDate(): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(
    cutoffDate.getDate() - RUN_EXECUTIONS_RETENTION_DAYS_THRESHOLD
  );

  return cutoffDate.getTime();
}

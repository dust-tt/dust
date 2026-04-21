import logger from "@app/logger/logger";

export class WakeUpNonRetryableError extends Error {}

export async function runWakeUpActivity({
  workspaceId,
  wakeUpId,
}: {
  workspaceId: string;
  wakeUpId: string;
}): Promise<void> {
  logger.info(
    { wakeUpId, workspaceId },
    "Wake-up activity is not implemented yet."
  );
}

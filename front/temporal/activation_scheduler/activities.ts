import logger from "@app/logger/logger";

/**
 * Skeleton activity for the workspace-level activation run. Business logic
 * (what the short-lived run actually does) is not implemented yet.
 */
export async function runActivationForWorkspaceActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  logger.info(
    { workspaceId },
    "[ActivationScheduler] Skeleton activation activity invoked."
  );
}

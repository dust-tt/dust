import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";
import type { LabsTranscriptsConfigurationStatus } from "@app/types/labs";
import { Ok } from "@app/types/shared/result";

/**
 * Pauses all Labs transcripts temporal workflows and their schedules for a workspace.
 * Sets the status to the specified targetStatus (defaults to "disabled").
 * For relocation, use targetStatus="relocating" to preserve user intent.
 */
export async function pauseAllLabsWorkflows(
  auth: Authenticator,
  targetStatus: Exclude<
    LabsTranscriptsConfigurationStatus,
    "active"
  > = "disabled"
) {
  const allLabsConfigs =
    await LabsTranscriptsConfigurationResource.listByWorkspace({
      auth,
    });

  // Only pause configs that are currently active
  const activeConfigs = allLabsConfigs.filter(
    (config): config is LabsTranscriptsConfigurationResource =>
      config !== null && config.status === "active"
  );

  let stoppedWorkflows = 0;

  await concurrentExecutor(
    activeConfigs,
    async (config) => {
      logger.info(
        {
          labsTranscriptsConfigurationId: config.id,
          workspaceId: config.workspaceId,
          targetStatus,
        },
        "Stopping Labs workflow"
      );
      await stopRetrieveTranscriptsWorkflow(config, false);
      await config.setStatus(targetStatus);
      stoppedWorkflows++;
    },
    { concurrency: 3 }
  );

  logger.info(`Stopped ${stoppedWorkflows} Labs workflows`);

  return new Ok(stoppedWorkflows);
}

/**
 * Labs transcripts are deprecated. This stops schedules instead of starting them,
 * so older scripts cannot turn the Gong or Google transcript processors back on.
 */
export async function startActiveLabsWorkflows(auth: Authenticator) {
  logger.info(
    "Labs transcripts are deprecated. Stopping workflows instead of starting them."
  );
  return pauseAllLabsWorkflows(auth);
}

/**
 * Labs transcripts are deprecated and are not resumed after relocation.
 */
export async function unpauseAllLabsWorkflows(
  auth: Authenticator,
  fromStatus: Exclude<LabsTranscriptsConfigurationStatus, "active">
) {
  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      fromStatus,
    },
    "Labs transcripts are deprecated. Leaving workflows stopped."
  );
  return new Ok(0);
}

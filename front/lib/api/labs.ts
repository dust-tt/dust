import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";
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
 * Starts workflows for all active Labs transcripts configurations.
 * A config is considered active if status is "active" or if it has a dataSourceViewId
 * (retrieval-only mode).
 */
export async function startActiveLabsWorkflows(auth: Authenticator) {
  const allLabsConfigs =
    await LabsTranscriptsConfigurationResource.listByWorkspace({
      auth,
    });

  const activeConfigs = allLabsConfigs.filter(
    (config): config is LabsTranscriptsConfigurationResource =>
      config !== null &&
      (config.status === "active" || !!config.dataSourceViewId)
  );

  logger.info(`Found ${activeConfigs.length} active Labs configs`);

  let startedWorkflows = 0;

  await concurrentExecutor(
    activeConfigs,
    async (config) => {
      logger.info(
        {
          labsTranscriptsConfigurationId: config.id,
          workspaceId: config.workspaceId,
        },
        "Starting Labs workflow"
      );
      await launchRetrieveTranscriptsWorkflow(config);
      startedWorkflows++;
    },
    { concurrency: 3 }
  );

  logger.info(`Started ${startedWorkflows} Labs workflows`);

  return new Ok(startedWorkflows);
}

/**
 * Unpauses Labs workflows that were paused with a specific status.
 * Restores configs from the specified fromStatus back to "active" and restarts workflows.
 * This preserves user intent: configs that were manually disabled stay disabled.
 */
export async function unpauseAllLabsWorkflows(
  auth: Authenticator,
  fromStatus: Exclude<LabsTranscriptsConfigurationStatus, "active">
) {
  const allLabsConfigs =
    await LabsTranscriptsConfigurationResource.listByWorkspace({
      auth,
    });

  // Only unpause configs that match the fromStatus
  const configsToUnpause = allLabsConfigs.filter(
    (config): config is LabsTranscriptsConfigurationResource =>
      config !== null && config.status === fromStatus
  );

  logger.info(
    `Found ${configsToUnpause.length} Labs configs with status "${fromStatus}" to unpause`
  );

  let startedWorkflows = 0;

  await concurrentExecutor(
    configsToUnpause,
    async (config) => {
      logger.info(
        {
          labsTranscriptsConfigurationId: config.id,
          workspaceId: config.workspaceId,
          fromStatus,
        },
        "Unpausing Labs workflow"
      );
      await config.setStatus("active");
      await launchRetrieveTranscriptsWorkflow(config);
      startedWorkflows++;
    },
    { concurrency: 3 }
  );

  logger.info(`Unpaused ${startedWorkflows} Labs workflows`);

  return new Ok(startedWorkflows);
}

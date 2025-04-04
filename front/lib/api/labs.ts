import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";
import { Ok } from "@app/types";

/**
 * Pauses all Labs transcripts temporal workflows and their schedules for a workspace
 */
export async function pauseAllLabsWorkflows(auth: Authenticator) {
  const allLabsConfigs =
    await LabsTranscriptsConfigurationResource.listByWorkspace({
      auth,
    });

  const nonNullConfigs = allLabsConfigs.filter(
    (config): config is LabsTranscriptsConfigurationResource => config !== null
  );

  let stoppedWorkflows = 0;

  await concurrentExecutor(
    nonNullConfigs,
    async (config) => {
      logger.info(
        `Stopping Labs workflow for labs_transcripts_configuration_id ${config.id} on workspace_id ${config.workspaceId}`
      );
      await stopRetrieveTranscriptsWorkflow(config);
      await config.setIsActive(false);
      stoppedWorkflows++;
    },
    { concurrency: 3 }
  );

  logger.info(`Stopped ${stoppedWorkflows} Labs workflows`);

  return new Ok(stoppedWorkflows);
}

export async function startActiveLabsWorkflows(auth: Authenticator) {
  const allLabsConfigs =
    await LabsTranscriptsConfigurationResource.listByWorkspace({
      auth,
    });

  const activeConfigs = allLabsConfigs.filter(
    (config): config is LabsTranscriptsConfigurationResource =>
      config !== null && (config.isActive === true || !!config.dataSourceViewId)
  );

  logger.info(`Found ${activeConfigs.length} active Labs configs`);

  let startedWorkflows = 0;

  await concurrentExecutor(
    activeConfigs,
    async (config) => {
      logger.info(
        `Starting Labs workflow for labs_transcripts_configuration_id ${config.id} on workspace_id ${config.workspaceId}`
      );
      await launchRetrieveTranscriptsWorkflow(config);
      startedWorkflows++;
    },
    { concurrency: 3 }
  );

  logger.info(`Started ${startedWorkflows} Labs workflows`);

  return new Ok(startedWorkflows);
}

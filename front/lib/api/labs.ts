import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/client";
import { concurrentExecutor } from "@app/types";
import { Ok } from "@app/types";
import { labsTranscriptsProviders } from "@app/types/labs";

/**
 * Pauses all Labs transcripts temporal workflows and their schedules for a workspace
 */
export async function pauseAllLabsWorkflows(auth: Authenticator) {
  const allLabsConfigs = await concurrentExecutor(
    [...labsTranscriptsProviders],
    async (provider) => {
      const config =
        await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider,
        });
      return config;
    },
    { concurrency: 3 }
  );

  let stoppedWorkflows = 0;

  await concurrentExecutor(
    allLabsConfigs.filter(
      (config): config is LabsTranscriptsConfigurationResource =>
        config !== null
    ),
    async (config) => {
      logger.info(
        `Stopping Labs workflow for workspace ${config.workspaceId} and provider ${config.provider}`
      );
      await stopRetrieveTranscriptsWorkflow(config);
      await config.setIsActive(false);
      stoppedWorkflows++;
    },
    { concurrency: 3 }
  );

  return new Ok(stoppedWorkflows);
}

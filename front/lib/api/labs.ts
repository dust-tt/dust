import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/client";
import { Ok } from "@app/types";
import { labsTranscriptsProviders } from "@app/types/labs";

/**
 * Pauses all Labs transcripts temporal workflows and their schedules for a workspace
 */
export async function pauseAllLabsWorkflows(auth: Authenticator) {
  const allLabsConfigs = await Promise.all(
    labsTranscriptsProviders.map(async (provider) => {
      const config =
        await LabsTranscriptsConfigurationResource.findByWorkspaceAndProvider({
          auth,
          provider,
        });
      return config;
    })
  );

  let stoppedWorkflows = 0;

  allLabsConfigs.forEach(async (config) => {
    if (config) {
      await stopRetrieveTranscriptsWorkflow(config);
      await config.setIsActive(false);
      stoppedWorkflows++;
    }
  });

  return new Ok(stoppedWorkflows);
}

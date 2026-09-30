import { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import mainLogger from "@app/logger/logger";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/transcripts/client";

interface RetrieveTranscriptsResult {
  fileIds: string[];
}

export async function retrieveNewTranscriptsActivity(
  transcriptsConfigurationId: string,
  workspaceId: string
): Promise<RetrieveTranscriptsResult> {
  const workspaceAuth =
    await Authenticator.internalAdminForWorkspace(workspaceId);
  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.fetchById(
      workspaceAuth,
      transcriptsConfigurationId
    );

  if (!transcriptsConfiguration) {
    mainLogger.info(
      { transcriptsConfigurationId, workspaceId },
      "Labs transcripts configuration not found. Nothing to stop."
    );
    return { fileIds: [] };
  }

  mainLogger.info(
    {
      transcriptsConfigurationId: transcriptsConfiguration.sId,
      provider: transcriptsConfiguration.provider,
      workspaceId,
    },
    "Labs transcripts are deprecated. Stopping schedule."
  );

  await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
  return { fileIds: [] };
}

export async function processTranscriptActivity(
  transcriptsConfigurationId: string,
  fileId: string,
  workspaceId: string
): Promise<void> {
  mainLogger.info(
    { transcriptsConfigurationId, fileId, workspaceId },
    "Labs transcripts are deprecated. Skipping transcript processing."
  );
}

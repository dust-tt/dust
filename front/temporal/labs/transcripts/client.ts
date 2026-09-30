import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { ScheduleNotFoundError } from "@temporalio/client";

function makeScheduleId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  return `retrieve-transcripts-${transcriptsConfiguration.workspaceId}-${transcriptsConfiguration.id}`;
}

// Labs transcripts are deprecated. Callers that used to create a schedule now
// delete it, including the Gong connector path.
export async function launchRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<string, Error>> {
  const scheduleId = makeScheduleId(transcriptsConfiguration);
  const stopped = await stopRetrieveTranscriptsWorkflow(
    transcriptsConfiguration
  );
  if (stopped.isErr()) {
    return new Err(stopped.error);
  }
  return new Ok(scheduleId);
}

export async function stopRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  setIsActiveToFalse: boolean = true
): Promise<Result<void, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = makeScheduleId(transcriptsConfiguration);

  const childLogger = logger.child({
    scheduleId,
    transcriptsConfigurationId: transcriptsConfiguration.sId,
  });

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
    childLogger.info("Deleted transcripts schedule successfully.");

    if (setIsActiveToFalse) {
      await transcriptsConfiguration.setStatus("disabled");
    }
    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      childLogger.warn("Schedule not found, nothing to delete.");
      if (setIsActiveToFalse) {
        await transcriptsConfiguration.setStatus("disabled");
      }
      return new Ok(undefined);
    }

    childLogger.error({ err }, "Failed to delete schedule.");
    return new Err(normalizeError(err));
  }
}

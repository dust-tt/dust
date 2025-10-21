import type { ScheduleOptions } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { TRANSCRIPTS_QUEUE_NAME } from "@app/temporal/labs/transcripts/config";
import { makeRetrieveTranscriptWorkflowId } from "@app/temporal/labs/transcripts/utils";
import { retrieveNewTranscriptsWorkflow } from "@app/temporal/labs/transcripts/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

function makeScheduleId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  return `retrieve-transcripts-${transcriptsConfiguration.workspaceId}-${transcriptsConfiguration.id}`;
}

function getScheduleOptions(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  scheduleId: string
): ScheduleOptions {
  return {
    action: {
      type: "startWorkflow",
      workflowType: retrieveNewTranscriptsWorkflow,
      args: [
        {
          workspaceId: transcriptsConfiguration.workspaceId,
          transcriptsConfigurationId: transcriptsConfiguration.sId,
        },
      ],
      taskQueue: TRANSCRIPTS_QUEUE_NAME,
      workflowId: makeRetrieveTranscriptWorkflowId(transcriptsConfiguration),
    },
    scheduleId,
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    spec: {
      cronExpressions: ["*/5 * * * *"],
    },
    memo: {
      transcriptsConfigurationId: transcriptsConfiguration.id,
      transcriptsConfigurationSid: transcriptsConfiguration.sId,
      IsProcessingTranscripts: transcriptsConfiguration.isActive,
      IsStoringTranscripts: transcriptsConfiguration.dataSourceViewId !== null,
    },
  };
}

export async function launchRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = makeScheduleId(transcriptsConfiguration);
  const scheduleOptions = getScheduleOptions(
    transcriptsConfiguration,
    scheduleId
  );

  const childLogger = logger.child({
    scheduleId,
    transcriptsConfigurationId: transcriptsConfiguration.id,
    transcriptsConfigurationSid: transcriptsConfiguration.sId,
  });

  // Try to update existing schedule first
  const existingSchedule = client.schedule.getHandle(scheduleId);
  try {
    await existingSchedule.update((previous) => {
      return {
        ...scheduleOptions,
        state: previous.state,
      };
    });

    childLogger.info("Updated existing transcripts schedule.");
    return new Ok(scheduleId);
  } catch (err) {
    if (!(err instanceof ScheduleNotFoundError)) {
      childLogger.error({ err }, "Failed to update existing schedule.");
      return new Err(normalizeError(err));
    }
  }

  // Schedule doesn't exist, create new one
  try {
    await client.schedule.create(scheduleOptions);
    childLogger.info("Created new transcripts schedule.");
    return new Ok(scheduleId);
  } catch (error) {
    childLogger.error({ error }, "Failed to create new schedule.");
    return new Err(normalizeError(error));
  }
}

export async function stopRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  setIsActiveToFalse: boolean = true
): Promise<Result<void, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const scheduleId = makeScheduleId(transcriptsConfiguration);

  const childLogger = logger.child({
    scheduleId,
    transcriptsConfigurationId: transcriptsConfiguration.id,
    transcriptsConfigurationSid: transcriptsConfiguration.sId,
  });

  try {
    const handle = client.schedule.getHandle(scheduleId);
    await handle.delete();
    childLogger.info("Deleted transcripts schedule successfully.");

    if (setIsActiveToFalse) {
      await transcriptsConfiguration.setIsActive(false);
    }
    return new Ok(undefined);
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      childLogger.warn("Schedule not found, nothing to delete.");
      if (setIsActiveToFalse) {
        await transcriptsConfiguration.setIsActive(false);
      }
      return new Ok(undefined);
    }

    childLogger.error({ err }, "Failed to delete schedule.");
    return new Err(normalizeError(err));
  }
}

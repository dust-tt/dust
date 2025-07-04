import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  WorkflowNotFoundError,
} from "@temporalio/client";

import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import {
  TRANSCRIPTS_QUEUE_NAME,
  TRANSCRIPTS_SCHEDULE_POLICIES,
  TRANSCRIPTS_SCHEDULE_SPEC,
} from "@app/temporal/labs/transcripts/config";
import { retrieveNewTranscriptsWorkflow } from "@app/temporal/labs/transcripts/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

function makeTranscriptScheduleId(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): string {
  return `labs-transcripts-schedule-${transcriptsConfiguration.id}`;
}

export async function launchRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeTranscriptScheduleId(transcriptsConfiguration);

  try {
    await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: retrieveNewTranscriptsWorkflow,
        args: [transcriptsConfiguration.sId],
        taskQueue: TRANSCRIPTS_QUEUE_NAME,
      },
      scheduleId,
      policies: TRANSCRIPTS_SCHEDULE_POLICIES,
      spec: TRANSCRIPTS_SCHEDULE_SPEC,
      memo: {
        transcriptsConfigurationId: transcriptsConfiguration.id,
        transcriptsConfigurationSid: transcriptsConfiguration.sId,
        IsProcessingTranscripts: transcriptsConfiguration.isActive,
        IsStoringTranscripts:
          transcriptsConfiguration.dataSourceViewId !== null,
      },
    });

    // Trigger the schedule to start the workflow immediately
    const scheduleHandle = client.schedule.getHandle(scheduleId);
    await scheduleHandle.trigger();

    logger.info(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "Transcript retrieval schedule started."
    );
    return new Ok(scheduleId);
  } catch (e) {
    // If the schedule is already running, just trigger it
    if (e instanceof ScheduleAlreadyRunning) {
      try {
        const scheduleHandle = client.schedule.getHandle(scheduleId);
        await scheduleHandle.trigger();
        logger.info(
          {
            scheduleId,
            transcriptsConfigurationId: transcriptsConfiguration.id,
          },
          "Transcript retrieval schedule already exists, triggered."
        );
        return new Ok(scheduleId);
      } catch (triggerError) {
        logger.error(
          {
            scheduleId,
            transcriptsConfigurationId: transcriptsConfiguration.id,
            error: triggerError,
          },
          "Failed to trigger existing transcript retrieval schedule."
        );
        return new Err(normalizeError(triggerError));
      }
    }

    logger.error(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
        error: e,
      },
      "Transcript retrieval schedule failed."
    );
    return new Err(normalizeError(e));
  }
}

export async function stopRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  setIsActiveToFalse: boolean = true
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeTranscriptScheduleId(transcriptsConfiguration);

  try {
    const scheduleHandle = client.schedule.getHandle(scheduleId);

    try {
      // First, get the schedule description to find running workflows
      const scheduleDescription = await scheduleHandle.describe();

      // Terminate any running workflows from this schedule
      for (const action of scheduleDescription.info.recentActions) {
        try {
          const workflowHandle = client.workflow.getHandle(
            action.action.workflow.workflowId
          );
          await workflowHandle.terminate();
        } catch (error) {
          if (!(error instanceof WorkflowNotFoundError)) {
            logger.error(
              { error, workflowId: action.action.workflow.workflowId },
              "Failed to terminate workflow."
            );
          }
        }
      }

      // Delete the schedule
      await scheduleHandle.delete();
      logger.info(
        {
          scheduleId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "Transcript retrieval schedule deleted."
      );
    } catch (e) {
      if (!(e instanceof ScheduleNotFoundError)) {
        throw e;
      }
      logger.info(
        {
          scheduleId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "Transcript retrieval schedule was not found (already deleted)."
      );
    }

    if (setIsActiveToFalse) {
      await transcriptsConfiguration.setIsActive(false);
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
        error: e,
      },
      "Failed stopping transcript retrieval schedule."
    );
    return new Err(normalizeError(e));
  }
}

export async function pauseRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeTranscriptScheduleId(transcriptsConfiguration);

  try {
    const scheduleHandle = client.schedule.getHandle(scheduleId);
    await scheduleHandle.pause();

    logger.info(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "Transcript retrieval schedule paused."
    );
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof ScheduleNotFoundError) {
      logger.info(
        {
          scheduleId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "Transcript retrieval schedule not found (cannot pause)."
      );
      return new Ok(undefined);
    }

    logger.error(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
        error: e,
      },
      "Failed pausing transcript retrieval schedule."
    );
    return new Err(normalizeError(e));
  }
}

export async function resumeRetrieveTranscriptsWorkflow(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeTranscriptScheduleId(transcriptsConfiguration);

  try {
    const scheduleHandle = client.schedule.getHandle(scheduleId);
    await scheduleHandle.unpause();

    logger.info(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "Transcript retrieval schedule resumed."
    );
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof ScheduleNotFoundError) {
      logger.info(
        {
          scheduleId,
          transcriptsConfigurationId: transcriptsConfiguration.id,
        },
        "Transcript retrieval schedule not found (cannot resume)."
      );
      return new Ok(undefined);
    }

    logger.error(
      {
        scheduleId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
        error: e,
      },
      "Failed resuming transcript retrieval schedule."
    );
    return new Err(normalizeError(e));
  }
}

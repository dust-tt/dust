import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/intercom/temporal/config";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";
import { intercomUpdatesSignal } from "@connectors/connectors/intercom/temporal/signals";
import {
  intercomConversationSyncWorkflow,
  intercomFullSyncWorkflow,
  intercomHelpCenterSyncWorkflow,
} from "@connectors/connectors/intercom/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import {
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  scheduleExists,
  unpauseAndTriggerSchedule,
} from "@connectors/lib/temporal_schedules";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import {
  getIntercomFullSyncWorkflowId,
  makeIntercomConversationScheduleId,
  makeIntercomHelpCenterScheduleId,
  normalizeError,
} from "@connectors/types";

export async function launchIntercomFullSyncWorkflow({
  connectorId,
  fromTs = null,
  helpCenterIds = [],
  teamIds = [],
  hasUpdatedSelectAllConversations = false,
  forceResync = false,
}: {
  connectorId: ModelId;
  fromTs?: number | null;
  helpCenterIds?: string[];
  teamIds?: string[];
  hasUpdatedSelectAllConversations?: boolean;
  forceResync?: boolean;
}): Promise<Result<string, Error>> {
  if (fromTs) {
    throw new Error("[Intercom] Workflow does not support fromTs.");
  }

  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = getIntercomFullSyncWorkflowId(connector);
  const signaledHelpCenterIds: IntercomUpdateSignal[] = helpCenterIds.map(
    (helpCenterId) => ({
      type: "help_center",
      intercomId: helpCenterId,
      forceResync,
    })
  );
  const signaledTeamIds: IntercomUpdateSignal[] = teamIds.map((teamId) => ({
    type: "team",
    intercomId: teamId,
    forceResync,
  }));
  const signaledHasUpdatedSelectAllConvos: IntercomUpdateSignal[] =
    hasUpdatedSelectAllConversations
      ? [
          {
            type: "all_conversations",
            intercomId: "all_conversations",
            forceResync: false,
          },
        ]
      : [];
  const signals = [
    ...signaledHelpCenterIds,
    ...signaledTeamIds,
    ...signaledHasUpdatedSelectAllConvos,
  ];

  try {
    await client.workflow.signalWithStart(intercomFullSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: intercomUpdatesSignal,
      signalArgs: [signals],
      memo: {
        connectorId,
      },
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  return new Ok(workflowId);
}

export async function stopIntercomSchedulesAndWorkflows(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const helpCenterResult = await pauseSchedule({
    scheduleId: makeIntercomHelpCenterScheduleId(connector),
    connector,
  });

  if (helpCenterResult.isErr()) {
    return helpCenterResult;
  }

  const conversationResult = await pauseSchedule({
    scheduleId: makeIntercomConversationScheduleId(connector),
    connector,
  });

  if (conversationResult.isErr()) {
    return conversationResult;
  }

  const client = await getTemporalClient();
  const workflowId = getIntercomFullSyncWorkflowId(connector);

  try {
    const handle: WorkflowHandle<typeof intercomFullSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate();
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      logger.error(
        {
          workflowId,
          error,
        },
        "[Intercom] Failed to stop full sync workflow."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(undefined);
}

async function launchIntercomHelpCenterSchedule(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  return createSchedule({
    connector,
    action: {
      type: "startWorkflow",
      workflowType: intercomHelpCenterSyncWorkflow,
      args: [
        {
          connectorId: connector.id,
        },
      ],
      taskQueue: QUEUE_NAME,
    },
    scheduleId: makeIntercomHelpCenterScheduleId(connector),
    policies: {
      catchupWindow: "1 day",
      overlap: ScheduleOverlapPolicy.BUFFER_ONE,
    },
    spec: {
      intervals: [
        {
          every: "1 day",
        },
      ],
    },
  });
}

async function launchIntercomConversationSchedule(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  return createSchedule({
    connector,
    action: {
      type: "startWorkflow",
      workflowType: intercomConversationSyncWorkflow,
      args: [
        {
          connectorId: connector.id,
        },
      ],
      taskQueue: QUEUE_NAME,
    },
    scheduleId: makeIntercomConversationScheduleId(connector),
    policies: {
      catchupWindow: "1 day",
      overlap: ScheduleOverlapPolicy.BUFFER_ONE,
    },
    spec: {
      intervals: [
        {
          every: "20 minutes",
        },
      ],
    },
  });
}

export async function launchIntercomSchedules(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const helpCenterResult = await launchIntercomHelpCenterSchedule(connector);
  if (helpCenterResult.isErr()) {
    return helpCenterResult;
  }
  const conversationResult =
    await launchIntercomConversationSchedule(connector);
  if (conversationResult.isErr()) {
    return conversationResult;
  }

  return new Ok(undefined);
}

export async function unpauseIntercomSchedules(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const helpCenterScheduleId = makeIntercomHelpCenterScheduleId(connector);
  const conversationScheduleId = makeIntercomConversationScheduleId(connector);

  const helpCenterExists = await scheduleExists({
    scheduleId: helpCenterScheduleId,
  });
  const helpCenterResult = !helpCenterExists
    ? await launchIntercomHelpCenterSchedule(connector)
    : await unpauseAndTriggerSchedule({
        scheduleId: helpCenterScheduleId,
        connector,
      });
  if (helpCenterResult.isErr()) {
    return helpCenterResult;
  }

  const conversationExists = await scheduleExists({
    scheduleId: conversationScheduleId,
  });
  const conversationResult = !conversationExists
    ? await launchIntercomConversationSchedule(connector)
    : await unpauseAndTriggerSchedule({
        scheduleId: conversationScheduleId,
        connector,
      });
  if (conversationResult.isErr()) {
    return conversationResult;
  }
  return new Ok(undefined);
}

export async function deleteIntercomSchedules(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  await stopIntercomSchedulesAndWorkflows(connector);

  const helpCenterResult = await deleteSchedule({
    scheduleId: makeIntercomHelpCenterScheduleId(connector),
    connector,
  });

  if (helpCenterResult.isErr()) {
    return helpCenterResult;
  }

  const conversationResult = await deleteSchedule({
    scheduleId: makeIntercomConversationScheduleId(connector),
    connector,
  });

  if (conversationResult.isErr()) {
    return conversationResult;
  }

  return new Ok(undefined);
}

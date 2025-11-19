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
  intercomFullSyncWorkflow,
  intercomScheduledConversationSyncWorkflow,
  intercomScheduledHelpCenterSyncWorkflow,
} from "@connectors/connectors/intercom/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import {
  createSchedule,
  deleteSchedule,
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

  const workflowId = getIntercomFullSyncWorkflowId(connectorId);
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

export async function stopIntercomFullSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = getIntercomFullSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof intercomFullSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    await handle.terminate();
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      logger.error(
        {
          workflowId,
          error: e,
        },
        "[Intercom] Failed stopping full sync workflow."
      );
      return new Err(normalizeError(e));
    }
  }

  return new Ok(undefined);
}

export async function launchIntercomScheduledWorkflows(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const helpCenterResult = await createSchedule({
    connector,
    action: {
      type: "startWorkflow",
      workflowType: intercomScheduledHelpCenterSyncWorkflow,
      args: [{ connectorId: connector.id }],
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

  if (helpCenterResult.isErr()) {
    return new Err(helpCenterResult.error);
  }

  const conversationResult = await createSchedule({
    connector,
    action: {
      type: "startWorkflow",
      workflowType: intercomScheduledConversationSyncWorkflow,
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

  if (conversationResult.isErr()) {
    return new Err(conversationResult.error);
  }

  return new Ok(undefined);
}

export async function stopIntercomScheduledWorkflows(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const helpCenterResult = await deleteSchedule({
    scheduleId: makeIntercomHelpCenterScheduleId(connector),
    connector,
  });

  if (helpCenterResult.isErr()) {
    return new Err(helpCenterResult.error);
  }

  const conversationResult = await deleteSchedule({
    scheduleId: makeIntercomConversationScheduleId(connector),
    connector,
  });

  if (conversationResult.isErr()) {
    return new Err(conversationResult.error);
  }

  return new Ok(undefined);
}

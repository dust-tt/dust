import type { ModelId, Result } from "@dust-tt/types";
import { Err, getIntercomSyncWorkflowId, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/intercom/temporal/config";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";
import { intercomUpdatesSignal } from "@connectors/connectors/intercom/temporal/signals";
import { intercomSyncWorkflow } from "@connectors/connectors/intercom/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function launchIntercomSyncWorkflow({
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

  const workflowId = getIntercomSyncWorkflowId(connectorId);
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

  // When the workflow is inactive, we omit passing helpCenterIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(intercomSyncWorkflow, {
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
      cronSchedule: "30 * * * *", // Every hour, at 30 of the hour.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopIntercomSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = getIntercomSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof intercomSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        throw e;
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      "[Intercom] Failed stopping workflow."
    );
    return new Err(e as Error);
  }
}

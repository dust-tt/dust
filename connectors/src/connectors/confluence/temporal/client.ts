import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import type { SpaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import { spaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import {
  makeConfluenceFullSyncWorkflowId,
  makeConfluenceRemoveSpacesWorkflowId,
} from "@connectors/connectors/confluence/temporal/utils";
import {
  confluenceFullSyncWorkflow,
  confluenceRemoveSpacesWorkflow,
} from "@connectors/connectors/confluence/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";

export async function launchConfluenceFullSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = []
): Promise<Result<undefined, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "added",
    spaceId: sId,
  }));

  // When the workflow is inactive, we omit passing spaceIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(confluenceFullSyncWorkflow, {
      args: [
        {
          connectorId: connector.id,
          dataSourceConfig,
          connectionId: connector.connectionId,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId: makeConfluenceFullSyncWorkflowId(connector.id),
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: spaceUpdatesSignal,
      signalArgs: [signalArgs],
      memo: {
        connectorId,
      },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(undefined);
}

export async function launchConfluenceRemoveSpacesSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = []
) {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "removed",
    spaceId: sId,
  }));

  try {
    await client.workflow.signalWithStart(confluenceRemoveSpacesWorkflow, {
      args: [
        {
          connectorId: connector.id,
          spaceIds,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId: makeConfluenceRemoveSpacesWorkflowId(connector.id),
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: spaceUpdatesSignal,
      signalArgs: [signalArgs],
      memo: {
        connectorId,
      },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(undefined);
}

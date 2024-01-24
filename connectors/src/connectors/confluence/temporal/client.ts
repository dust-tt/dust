import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/confluence/temporal/config";
import type { SpaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import { spaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import {
  makeConfluenceRemoveSpacesWorkflowId,
  makeConfluenceSyncWorkflowId,
} from "@connectors/connectors/confluence/temporal/utils";
import {
  confluenceRemoveSpacesWorkflow,
  confluenceSyncWorkflow,
} from "@connectors/connectors/confluence/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

export async function launchConfluenceSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = [],
  forceUpsert = false
): Promise<Result<string, Error>> {
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

  const workflowId = makeConfluenceSyncWorkflowId(connector.id);

  // When the workflow is inactive, we omit passing spaceIds as they are only used to signal modifications within a currently active full sync workflow.
  try {
    await client.workflow.signalWithStart(confluenceSyncWorkflow, {
      args: [
        {
          connectorId: connector.id,
          dataSourceConfig,
          connectionId: connector.connectionId,
          forceUpsert,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        connectorId: [connectorId],
      },
      signal: spaceUpdatesSignal,
      signalArgs: [signalArgs],
      memo: {
        connectorId,
      },
      cronSchedule: "0 * * * *", // Every hour.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function launchConfluenceRemoveSpacesSyncWorkflow(
  connectorId: ModelId,
  spaceIds: string[] = []
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const client = await getTemporalClient();
  const signalArgs: SpaceUpdatesSignal[] = spaceIds.map((sId) => ({
    action: "removed",
    spaceId: sId,
  }));

  const workflowId = makeConfluenceRemoveSpacesWorkflowId(connector.id);

  try {
    await client.workflow.signalWithStart(confluenceRemoveSpacesWorkflow, {
      args: [
        {
          connectorId: connector.id,
          spaceIds,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
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

  return new Ok(workflowId);
}

export async function stopConfluenceSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(
      `[Intercom] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = makeConfluenceSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof confluenceSyncWorkflow> =
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
      "Failed to stop Confluence workflow."
    );
    return new Err(e as Error);
  }
}

import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/zendesk/temporal/config";
import type { ZendeskUpdateSignal } from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskUpdatesSignal } from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskSyncWorkflow } from "@connectors/connectors/zendesk/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export function getZendeskSyncWorkflowId(connectorId: ModelId): string {
  return `zendesk-sync-${connectorId}`;
}

export async function launchZendeskSyncWorkflow({
  connectorId,
  startFromTs = null,
  brandIds = [],
  ticketsBrandIds = [],
  helpCenterBrandIds = [],
  categoryIds = [],
  forceResync = false,
}: {
  connectorId: ModelId;
  startFromTs?: number | null;
  brandIds?: number[];
  ticketsBrandIds?: number[];
  helpCenterBrandIds?: number[];
  categoryIds?: number[];
  forceResync?: boolean;
}): Promise<Result<string, Error>> {
  if (startFromTs) {
    throw new Error("[Zendesk] startFromTs not implemented yet.");
  }

  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Zendesk] Connector not found, connectorId: ${connectorId}`
    );
  }

  const signals: ZendeskUpdateSignal[] = [
    ...brandIds.map(
      (brandId): ZendeskUpdateSignal => ({
        type: "brand",
        zendeskId: brandId,
        forceResync,
      })
    ),
    ...helpCenterBrandIds.map(
      (brandId): ZendeskUpdateSignal => ({
        type: "help-center",
        zendeskId: brandId,
        forceResync,
      })
    ),
    ...ticketsBrandIds.map(
      (brandId): ZendeskUpdateSignal => ({
        type: "tickets",
        zendeskId: brandId,
        forceResync,
      })
    ),
    ...categoryIds.map(
      (categoryId): ZendeskUpdateSignal => ({
        type: "category",
        zendeskId: categoryId,
        forceResync,
      })
    ),
  ];

  const workflowId = getZendeskSyncWorkflowId(connectorId);
  try {
    await client.workflow.signalWithStart(zendeskSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: { connectorId: [connectorId] },
      signal: zendeskUpdatesSignal,
      signalArgs: [signals],
      memo: { connectorId },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopZendeskSyncWorkflow(
  connectorId: ModelId
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Zendesk] Connector not found. ConnectorId: ${connectorId}`
    );
  }

  const workflowId = getZendeskSyncWorkflowId(connectorId);

  try {
    const handle: WorkflowHandle<typeof zendeskSyncWorkflow> =
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
      { workflowId, error: e },
      "[Zendesk] Failed to stop the workflow."
    );
    return new Err(e as Error);
  }
}

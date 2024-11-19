import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";

import {
  GARBAGE_COLLECT_QUEUE_NAME,
  QUEUE_NAME,
} from "@connectors/connectors/zendesk/temporal/config";
import type {
  ZendeskCategoryUpdateSignal,
  ZendeskUpdateSignal,
} from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskUpdatesSignal } from "@connectors/connectors/zendesk/temporal/signals";
import {
  zendeskGarbageCollectionWorkflow,
  zendeskSyncWorkflow,
} from "@connectors/connectors/zendesk/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export function getZendeskSyncWorkflowId(connectorId: ModelId): string {
  return `zendesk-sync-${connectorId}`;
}

export function getZendeskGarbageCollectionWorkflowId(
  connectorId: ModelId
): string {
  return `zendesk-gc-${connectorId}`;
}

export async function launchZendeskSyncWorkflow(
  connector: ConnectorResource,
  {
    startFromTs = null,
    brandIds = [],
    ticketsBrandIds = [],
    helpCenterBrandIds = [],
    categoryIds = [],
    forceResync = false,
  }: {
    startFromTs?: number | null;
    brandIds?: number[];
    ticketsBrandIds?: number[];
    helpCenterBrandIds?: number[];
    categoryIds?: { brandId: number; categoryId: number }[];
    forceResync?: boolean;
  } = {}
): Promise<Result<undefined, Error>> {
  if (startFromTs) {
    throw new Error("[Zendesk] startFromTs not implemented yet.");
  }

  const client = await getTemporalClient();

  const signals: (ZendeskUpdateSignal | ZendeskCategoryUpdateSignal)[] = [
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
      ({ brandId, categoryId }): ZendeskCategoryUpdateSignal => ({
        type: "category",
        categoryId,
        brandId,
        forceResync,
      })
    ),
  ];

  const workflowId = getZendeskSyncWorkflowId(connector.id);
  try {
    await client.workflow.signalWithStart(zendeskSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: { connectorId: [connector.id] },
      signal: zendeskUpdatesSignal,
      signalArgs: [signals],
      memo: { connectorId: connector.id },
      cronSchedule: "*/5 * * * *", // Every 5 minutes.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(undefined);
}

export async function stopZendeskWorkflows(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(
      `[Zendesk] Connector not found. ConnectorId: ${connectorId}`
    );
  }
  const workflowIds = [
    getZendeskSyncWorkflowId(connectorId),
    getZendeskGarbageCollectionWorkflowId(connectorId),
  ];
  for (const workflowId of workflowIds) {
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
    } catch (e) {
      logger.error(
        { workflowId, error: e },
        "[Zendesk] Failed to stop the workflow."
      );
      return new Err(e as Error);
    }
  }
  return new Ok(undefined);
}

export async function launchZendeskGarbageCollectionWorkflow(
  connector: ConnectorResource
): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowId = getZendeskGarbageCollectionWorkflowId(connector.id);
  try {
    await client.workflow.start(zendeskGarbageCollectionWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: GARBAGE_COLLECT_QUEUE_NAME,
      workflowId,
      searchAttributes: { connectorId: [connector.id] },
      memo: { connectorId: connector.id },
      cronSchedule: "0 3 * * *", // Every day at 3 a.m.
    });
  } catch (err: unknown) {
    // ignoring errors caused by relaunching the gc workflow
    if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
      return new Err(err as Error);
    }
  }

  return new Ok(undefined);
}

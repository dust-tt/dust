import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WorkflowHandle } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/zendesk/temporal/config";
import type {
  ZendeskCategoryUpdateSignal,
  ZendeskUpdateSignal,
} from "@connectors/connectors/zendesk/temporal/signals";
import { zendeskUpdatesSignal } from "@connectors/connectors/zendesk/temporal/signals";
import {
  zendeskGarbageCollectionWorkflow,
  zendeskSyncWorkflow,
} from "@connectors/connectors/zendesk/temporal/workflows";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";
import {
  getZendeskGarbageCollectionWorkflowId,
  getZendeskSyncWorkflowId,
} from "@connectors/types";

export async function launchZendeskSyncWorkflow(
  connector: ConnectorResource,
  {
    brandIds = [],
    ticketsBrandIds = [],
    helpCenterBrandIds = [],
    categoryIds = [],
    forceResync = false,
  }: {
    brandIds?: number[];
    ticketsBrandIds?: number[];
    helpCenterBrandIds?: number[];
    categoryIds?: { brandId: number; categoryId: number }[];
    forceResync?: boolean;
  } = {}
): Promise<Result<undefined, Error>> {
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
  const minute = connector.id % 30; // spreading workflows across each half-hour
  try {
    await client.workflow.signalWithStart(zendeskSyncWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: { connectorId: [connector.id] },
      signal: zendeskUpdatesSignal,
      signalArgs: [signals],
      memo: { connectorId: connector.id },
      cronSchedule: `${minute},${30 + minute} * * * *`, // Every 30 minutes.
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(undefined);
}

export async function stopZendeskWorkflows(
  connector: ConnectorResource
): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowIds = [
    getZendeskSyncWorkflowId(connector.id),
    getZendeskGarbageCollectionWorkflowId(connector.id),
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

/**
 * Launches a Zendesk workflow that will sync everything that was selected by the user in the UI.
 *
 * It recreates the signals necessary to resync every resource selected by the user,
 * which are all the brands and all the categories whose Help Center is not selected as a whole.
 */
export async function launchZendeskFullSyncWorkflow(
  connector: ConnectorResource,
  { forceResync = false }: { forceResync?: boolean } = {}
): Promise<Result<string, Error>> {
  const brandIds = await ZendeskBrandResource.fetchAllBrandIds(connector.id);
  const noReadHelpCenterBrandIds =
    await ZendeskBrandResource.fetchHelpCenterReadForbiddenBrandIds(
      connector.id
    );
  // syncing individual categories syncs for ones where the Help Center is not selected as a whole
  const categoryIds = (
    await concurrentExecutor(
      noReadHelpCenterBrandIds,
      async (brandId) => {
        const categoryIds =
          await ZendeskCategoryResource.fetchReadOnlyCategoryIdsByBrandId({
            connectorId: connector.id,
            brandId,
          });
        return categoryIds.map((categoryId) => ({ categoryId, brandId }));
      },
      { concurrency: 10 }
    )
  ).flat();

  const result = await launchZendeskSyncWorkflow(connector, {
    brandIds,
    categoryIds,
    forceResync,
  });

  return result.isErr() ? result : new Ok(connector.id.toString());
}

export async function launchZendeskGarbageCollectionWorkflow(
  connector: ConnectorResource
): Promise<Result<undefined, Error>> {
  const client = await getTemporalClient();

  const workflowId = getZendeskGarbageCollectionWorkflowId(connector.id);
  try {
    await client.workflow.start(zendeskGarbageCollectionWorkflow, {
      args: [{ connectorId: connector.id }],
      taskQueue: QUEUE_NAME,
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

/**
 * Launches a Zendesk workflow that will resync the tickets.
 *
 * It recreates the signals necessary to resync every brand whose tickets are selected by the user.
 */
export async function launchZendeskTicketReSyncWorkflow(
  connector: ConnectorResource,
  { forceResync = false }: { forceResync?: boolean } = {}
): Promise<Result<string, Error>> {
  const brandIds = await ZendeskBrandResource.fetchTicketsAllowedBrandIds(
    connector.id
  );

  const result = await launchZendeskSyncWorkflow(connector, {
    brandIds,
    forceResync,
  });

  return result.isErr() ? result : new Ok(connector.id.toString());
}

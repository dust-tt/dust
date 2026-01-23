import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import {
  MAX_CONCURRENT_CHILD_WORKFLOWS,
  MAX_PENDING_UPSERT_ACTIVITIES_PER_CHILD_WORKFLOW,
} from "@connectors/connectors/notion/temporal/config";
import { upsertDatabaseInCore } from "@connectors/connectors/notion/temporal/workflows/upserts";
import type { ModelId } from "@connectors/types";

const {
  cachePage,
  cacheBlockChildren,
  renderAndUpsertPageFromCache,
  upsertDatabaseInConnectorsDb,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minute",
});

export async function upsertPageChildWorkflow({
  connectorId,
  pageId,
  runTimestamp,
  isBatchSync,
  pageIndex,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  runTimestamp: number;
  isBatchSync: boolean;
  pageIndex: number;
  topLevelWorkflowId: string;
}): Promise<{
  skipped: boolean;
}> {
  const loggerArgs = {
    connectorId,
    pageIndex,
  };

  const { skipped } = await cachePage({
    connectorId,
    pageId,
    loggerArgs,
    runTimestamp,
    topLevelWorkflowId,
  });

  if (skipped) {
    return {
      skipped,
    };
  }

  let cursor: string | null = null;
  let blockIndexInPage = 0;
  do {
    const { nextCursor, blocksWithChildren, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId: null,
        cursor,
        currentIndexInParent: blockIndexInPage,
        loggerArgs,
        topLevelWorkflowId,
      });
    cursor = nextCursor;
    blockIndexInPage += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenChildWorkflow, {
        workflowId: `${topLevelWorkflowId}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);

  await renderAndUpsertPageFromCache({
    connectorId,
    pageId,
    loggerArgs,
    runTimestamp,
    isFullSync: isBatchSync,
    topLevelWorkflowId,
  });

  return {
    skipped,
  };
}

export async function notionProcessBlockChildrenChildWorkflow({
  connectorId,
  pageId,
  blockId,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  blockId: string;
  topLevelWorkflowId: string;
}): Promise<void> {
  const loggerArgs = {
    connectorId,
  };

  let cursor: string | null = null;
  let blockIndexInParent = 0;

  do {
    const { nextCursor, blocksWithChildren, blocksCount } =
      await cacheBlockChildren({
        connectorId,
        pageId,
        blockId,
        cursor,
        currentIndexInParent: blockIndexInParent,
        topLevelWorkflowId,
        loggerArgs,
      });
    cursor = nextCursor;
    blockIndexInParent += blocksCount;

    for (const block of blocksWithChildren) {
      await executeChild(notionProcessBlockChildrenChildWorkflow, {
        workflowId: `${topLevelWorkflowId}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);
}

export async function syncResultPageChildWorkflow({
  connectorId,
  pageIds,
  runTimestamp,
  isBatchSync,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageIds: string[];
  runTimestamp: number;
  isBatchSync: boolean;
  topLevelWorkflowId: string;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES_PER_CHILD_WORKFLOW,
  });

  const promises: Promise<unknown>[] = [];

  for (const [pageIndex, pageId] of pageIds.entries()) {
    promises.push(
      upsertQueue.add(() =>
        executeChild(upsertPageChildWorkflow, {
          workflowId: `${topLevelWorkflowId}-upsert-page-${pageId}`,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              connectorId,
              pageId,
              runTimestamp,
              isBatchSync,
              pageIndex,
              topLevelWorkflowId,
            },
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        })
      )
    );
  }

  await Promise.all(promises);
}

export async function syncResultPageDatabaseChildWorkflow({
  connectorId,
  databaseIds,
  runTimestamp,
  topLevelWorkflowId,
  forceResync,
}: {
  connectorId: ModelId;
  databaseIds: string[];
  runTimestamp: number;
  topLevelWorkflowId: string;
  forceResync: boolean;
}): Promise<void> {
  const upsertQueue = new PQueue({
    concurrency: MAX_PENDING_UPSERT_ACTIVITIES_PER_CHILD_WORKFLOW,
  });
  const workflowQueue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  let promises: Promise<void | void[]>[] = [];

  for (const [databaseIndex, databaseId] of databaseIds.entries()) {
    const loggerArgs = {
      connectorId,
      databaseIndex,
    };

    promises.push(
      upsertQueue.add(() =>
        upsertDatabaseInConnectorsDb({
          connectorId,
          databaseId,
          runTimestamp,
          topLevelWorkflowId,
          loggerArgs,
          // In a force resync, we want to upsert the database immediately,
          // we don't want to wait for the upsert queue to process it.
          requestQueuingForUpsertToCore: !forceResync,
        })
      )
    );
  }

  // wait for all db upserts before moving on to the children pages
  // otherwise we don't have control over concurrency
  await Promise.all(promises);
  promises = [];

  // If we're doing a force resync, then we immediately upsert the databases.
  // Otherwise, we'll let the database upsert queue workflow handle the upserts.
  if (forceResync) {
    for (const databaseId of databaseIds) {
      promises.push(
        upsertDatabaseInCore({
          connectorId,
          databaseId,
          runTimestamp,
          topLevelWorkflowId,
          queue: workflowQueue,
          forceResync,
        })
      );
    }
  }

  await Promise.all(promises);
}

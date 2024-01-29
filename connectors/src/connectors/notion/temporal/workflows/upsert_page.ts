import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/notion/temporal/activities";

import { getWorkflowIdV2 } from "../utils";

const {
  cachePage,
  cacheBlockChildren,
  renderAndUpsertPageFromCache,
  cacheDatabaseChildren,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

export async function upsertPageWorkflow({
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
    const { nextCursor, blocksWithChildren, childDatabases, blocksCount } =
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
      await executeChild(notionProcessBlockChildrenWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
    for (const databaseId of childDatabases) {
      await executeChild(processChildDatabaseWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-child-database-${databaseId}`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, databaseId, topLevelWorkflowId }],
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

export async function notionProcessBlockChildrenWorkflow({
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
    const { nextCursor, blocksWithChildren, childDatabases, blocksCount } =
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
      await executeChild(notionProcessBlockChildrenWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-block-${block}-children`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, pageId, blockId: block, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
    for (const databaseId of childDatabases) {
      await executeChild(processChildDatabaseWorkflow, {
        workflowId: `${getWorkflowIdV2(
          connectorId
        )}-page-${pageId}-child-database-${databaseId}`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [{ connectorId, databaseId, topLevelWorkflowId }],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
    }
  } while (cursor);
}

export async function processChildDatabaseWorkflow({
  connectorId,
  databaseId,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  databaseId: string;
  topLevelWorkflowId: string;
}): Promise<void> {
  const loggerArgs = {
    connectorId,
  };

  let cursor: string | null = null;
  do {
    const { nextCursor } = await cacheDatabaseChildren({
      connectorId,
      databaseId,
      cursor,
      loggerArgs,
      topLevelWorkflowId,
    });
    cursor = nextCursor;
  } while (cursor);
}

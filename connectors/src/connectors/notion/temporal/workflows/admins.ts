import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { MAX_CONCURRENT_CHILD_WORKFLOWS } from "@connectors/connectors/notion/temporal/config";
import { upsertPageChildWorkflow } from "@connectors/connectors/notion/temporal/workflows/children";
import {
  performUpserts,
  upsertDatabase,
} from "@connectors/connectors/notion/temporal/workflows/upserts";

const {
  clearWorkflowCache,
  getDiscoveredResourcesFromCache,
  upsertDatabaseInConnectorsDb,
  deletePageOrDatabaseIfArchived,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion page.
export async function upsertPageWorkflow({
  connectorId,
  pageId,
}: {
  connectorId: ModelId;
  pageId: string;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;
  const runTimestamp = Date.now();

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  const { skipped } = await executeChild(upsertPageChildWorkflow, {
    workflowId: `${topLevelWorkflowId}-upsert-page-${pageId}`,
    searchAttributes: {
      connectorId: [connectorId],
    },
    args: [
      {
        connectorId,
        pageId,
        runTimestamp,
        isBatchSync: false,
        pageIndex: 0,
        topLevelWorkflowId,
      },
    ],
    parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
    memo: workflowInfo().memo,
  });

  // These are resources (pages/DBs) that we stumbled upon but don't know about. We upsert those as
  // well.
  let discoveredResources: {
    pageIds: string[];
    databaseIds: string[];
  } | null;
  do {
    discoveredResources = await getDiscoveredResourcesFromCache({
      connectorId,
      topLevelWorkflowId,
    });
    if (discoveredResources) {
      await performUpserts({
        connectorId,
        pageIds: discoveredResources.pageIds,
        databaseIds: discoveredResources.databaseIds,
        isGarbageCollectionRun: false,
        runTimestamp,
        pageIndex: null,
        isBatchSync: true,
        queue,
        childWorkflowsNameSuffix: "discovered",
        topLevelWorkflowId,
        forceResync: false,
      });
    }
  } while (discoveredResources);

  const loggerArgs = {
    connectorId,
    pageId,
  };

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await deletePageOrDatabaseIfArchived({
    connectorId,
    objectId: pageId,
    objectType: "page",
    loggerArgs,
  });

  return { skipped };
}

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion database.
export async function upsertDatabaseWorkflow({
  connectorId,
  databaseId,
  forceResync = false,
}: {
  connectorId: ModelId;
  databaseId: string;
  forceResync?: boolean;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  const runTimestamp = Date.now();

  const loggerArgs = {
    connectorId,
    databaseId,
  };

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await upsertDatabaseInConnectorsDb(
    connectorId,
    databaseId,
    Date.now(),
    topLevelWorkflowId,
    loggerArgs
  );

  await upsertDatabase({
    connectorId,
    databaseId,
    runTimestamp,
    topLevelWorkflowId,
    isGarbageCollectionRun: false,
    isBatchSync: false,
    queue,
    forceResync,
  });

  // These are resources (pages/DBs) that we stumbled upon but don't know about. We upsert those as
  // well.
  let discoveredResources: {
    pageIds: string[];
    databaseIds: string[];
  } | null;
  do {
    discoveredResources = await getDiscoveredResourcesFromCache({
      connectorId,
      topLevelWorkflowId,
    });
    if (discoveredResources) {
      await performUpserts({
        connectorId,
        pageIds: discoveredResources.pageIds,
        databaseIds: discoveredResources.databaseIds,
        isGarbageCollectionRun: false,
        runTimestamp,
        pageIndex: null,
        isBatchSync: true,
        queue,
        childWorkflowsNameSuffix: "discovered",
        topLevelWorkflowId,
        forceResync: false,
      });
    }
  } while (discoveredResources);

  await clearWorkflowCache({ connectorId, topLevelWorkflowId });

  await deletePageOrDatabaseIfArchived({
    connectorId,
    objectId: databaseId,
    objectType: "database",
    loggerArgs,
  });
}

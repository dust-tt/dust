import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";
import { chunk } from "lodash";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import { MAX_CONCURRENT_CHILD_WORKFLOWS } from "@connectors/connectors/notion/temporal/config";
import { upsertPageChildWorkflow } from "@connectors/connectors/notion/temporal/workflows/children";
import {
  performUpserts,
  upsertDatabase,
} from "@connectors/connectors/notion/temporal/workflows/upserts";
import type { ModelId } from "@connectors/types";

export function getUpsertPageWorkflowId(
  pageId: string,
  connectorId: ModelId
): string {
  return `notion-force-sync-upsert-page-${pageId}-connector-${connectorId}`;
}

export function getUpsertDatabaseWorkflowId(
  databaseId: string,
  connectorId: ModelId
): string {
  return `notion-force-sync-upsert-database-${databaseId}-connector-${connectorId}`;
}

const {
  clearWorkflowCache,
  getDiscoveredResourcesFromCache,
  upsertDatabaseInConnectorsDb,
  deletePageOrDatabaseIfArchived,
  updateSingleDocumentParents,
  getParentPageOrDb,
  maybeUpdateOrphaneResourcesParents,
  clearParentsLastUpdatedAt,
  getAllOrphanedResources,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion page.
export async function upsertPageWorkflow({
  connectorId,
  pageId,
  upsertParents = false,
}: {
  connectorId: ModelId;
  pageId: string;
  upsertParents?: boolean;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;
  const runTimestamp = Date.now();

  const queue = new PQueue({
    concurrency: MAX_CONCURRENT_CHILD_WORKFLOWS,
  });

  if (upsertParents) {
    await upsertParent({ connectorId, pageOrDbId: pageId });
  }

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

  await updateSingleDocumentParents({
    connectorId,
    notionDocumentId: pageId,
    documentType: "page",
  });

  return { skipped };
}

// Top level workflow to be used by the CLI or by Poké in order to force-refresh a given Notion database.
export async function upsertDatabaseWorkflow({
  connectorId,
  databaseId,
  forceResync = false,
  upsertParents = false,
}: {
  connectorId: ModelId;
  databaseId: string;
  forceResync?: boolean;
  upsertParents?: boolean;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  if (upsertParents) {
    await upsertParent({ connectorId, pageOrDbId: databaseId });
  }

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

  await updateSingleDocumentParents({
    connectorId,
    notionDocumentId: databaseId,
    documentType: "database",
  });
}

// Top level workflow to be used by the CLI or by Poké in order to update parents
// for all orphaned resources of a notion connector.
// The workflow will attempt to fetch the parent page from notion for every orphaned resource,
// and will update the parent of the resource in our database if we have it in our database.
export async function updateOrphanedResourcesParentsWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const BATCH_SIZE = 24;

  const { pageIds, databaseIds } = await getAllOrphanedResources({
    connectorId,
  });

  const allResources: Array<{ notionId: string; type: "page" | "database" }> = [
    ...pageIds.map((p) => ({
      notionId: p,
      type: "page" as const,
    })),
    ...databaseIds.map((d) => ({ notionId: d, type: "database" as const })),
    // Sort by notionId to make the order deterministic and avoid processing all pages first, then all databases.
  ].sort((a, b) => a.notionId.localeCompare(b.notionId));

  const chunks = chunk(allResources, BATCH_SIZE);

  for (const chunk of chunks) {
    await maybeUpdateOrphaneResourcesParents({
      connectorId,
      resources: chunk,
    });
  }

  await clearParentsLastUpdatedAt({ connectorId });
}

async function upsertParent({
  connectorId,
  pageOrDbId,
}: {
  connectorId: ModelId;
  pageOrDbId: string;
}) {
  const parentResult = await getParentPageOrDb({
    connectorId,
    pageOrDbId,
  });
  if (!parentResult) {
    return { skipped: true };
  }

  const { parentId, parentType } = parentResult;

  // In case of infinite parents loop, the workflow execution will fail at
  // first loop since they will have the same workflowId ("workflow execution
  // already started"). It's acceptable behaviour: it's very rare, it may not
  // even happen since contrarily to getParents, here we query notion directly
  // VS our connectors DB.
  switch (parentType) {
    case "page":
      await executeChild(upsertPageWorkflow, {
        workflowId: getUpsertPageWorkflowId(parentId, connectorId),
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            connectorId,
            pageId: parentId,
            upsertParents: true,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
      break;
    case "database":
      await executeChild(upsertDatabaseWorkflow, {
        workflowId: getUpsertDatabaseWorkflowId(parentId, connectorId),
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            connectorId,
            databaseId: parentId,
            forceResync: false,
            upsertParents: true,
          },
        ],
        parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
        memo: workflowInfo().memo,
      });
      break;
    case "workspace":
    case "unknown":
      break;
    default:
      throw new Error(`Unknown parent type: ${parentType}`);
  }
}

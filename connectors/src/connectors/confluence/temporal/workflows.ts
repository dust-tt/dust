import type { WorkflowInfo } from "@temporalio/workflow";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import { chunk } from "lodash";

import type { ConfluenceContentRef } from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceContentWithType } from "@connectors/connectors/confluence/lib/hierarchy";
import type * as activities from "@connectors/connectors/confluence/temporal/activities";
import type { SpaceBlob } from "@connectors/connectors/confluence/temporal/activities";
import type { SpaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import { spaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import {
  makeConfluenceRemoveSpacesWorkflowId,
  makeConfluenceRemoveSpaceWorkflowIdFromParentId,
  makeConfluenceSpaceSyncWorkflowIdFromParentId,
  makeConfluenceSyncTopLevelChildContentWorkflowIdFromParentId,
} from "@connectors/connectors/confluence/temporal/workflow_ids";
import type * as syncStatusActivities from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

const {
  confluenceCheckAndUpsertSingleContentActivity,
  confluenceGetActiveChildContentRefsActivity,
  confluenceGetSpaceBlobActivity,
  confluenceGetTopLevelContentIdsActivity,
  confluenceRemoveSpaceActivity,
  confluenceRemoveUnvisitedContentActivity,
  confluenceSaveStartSyncActivity,
  confluenceSaveSuccessSyncActivity,
  confluenceUpsertLeafContentActivity,
  confluenceUpsertPageWithFullParentsActivity,
  fetchConfluenceSpaceIdsForConnectorActivity,

  confluenceGetReportPersonalActionActivity,
  fetchConfluenceUserAccountAndConnectorIdsActivity,

  fetchConfluenceConfigurationActivity,
  confluenceUpsertSpaceFolderActivity,

  fetchAndUpsertRootContentActivity,

  getSpaceIdsToSyncActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 1,
    maximumInterval: "600 seconds",
  },
});

const { confluenceUpdateContentParentIdsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "90 minutes",
  heartbeatTimeout: "5 minutes",
});

const { reportInitialSyncProgress } = proxyActivities<
  typeof syncStatusActivities
>({
  startToCloseTimeout: "10 minutes",
});

// Set a conservative threshold to start a new workflow and
// avoid exceeding Temporal's max workflow size limit,
// since a Confluence page can have an unbounded number of pages.
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB = 10;

const MAX_LEAF_PAGES_PER_BATCH = 50;

const TOP_LEVEL_CONTENT_REFS_CHUNK_SIZE = 100;

export async function confluenceSyncWorkflow({
  connectorId,
  spaceIdsToBrowse,
}: {
  connectorId: ModelId;
  spaceIdsToBrowse?: string[];
}) {
  await confluenceSaveStartSyncActivity(connectorId);

  const spaceIdsToSync =
    spaceIdsToBrowse ?? (await getSpaceIdsToSyncActivity(connectorId));

  const spaceIdsMap = new Map<string, { forceUpsert: boolean }>(
    spaceIdsToSync.map((spaceId) => [spaceId, { forceUpsert: false }])
  );

  setHandler(spaceUpdatesSignal, (spaceUpdates: SpaceUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing space ids.
    for (const { action, forceUpsert, spaceId } of spaceUpdates) {
      if (action === "added") {
        spaceIdsMap.set(spaceId, { forceUpsert });
      } else {
        spaceIdsMap.delete(spaceId);
      }
    }
  });

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  let processedSpaces = 0;

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (spaceIdsMap.size > 0) {
    // Create a copy of the map to iterate over, to avoid issues with concurrent modification.
    const spaceIdsToProcess = new Map(spaceIdsMap);
    for (const [spaceId, opts] of spaceIdsToProcess) {
      // Report progress before processing each space.
      await reportInitialSyncProgress(
        connectorId,
        // At this point, the map was cleared from the processed spaces so we have to do
        // processedSpaces + spaceIdsMap.size to get the actual total, updated when we
        // get a signal.
        `${processedSpaces + 1}/${spaceIdsMap.size + processedSpaces} spaces`
      );

      // Async operation yielding control to the Temporal runtime.
      await executeChild(confluenceSpaceSyncWorkflow, {
        workflowId: makeConfluenceSpaceSyncWorkflowIdFromParentId(
          workflowId,
          spaceId
        ),
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId,
            isBatchSync: true,
            spaceId,
            forceUpsert: opts.forceUpsert,
          },
        ],
        memo,
      });

      // Remove the processed space from the original set after the async operation.
      spaceIdsMap.delete(spaceId);
      processedSpaces++;
    }
  }

  await confluenceSaveSuccessSyncActivity(connectorId);
}

interface ConfluenceSpaceSyncWorkflowInput {
  connectorId: ModelId;
  isBatchSync: boolean;
  spaceId: string;
  forceUpsert: boolean;
}

// Confluence Space Structure:
// - A single root content defining the space's entry point.
// - Top level content directly nested under the root content.
// Each top-level content can have a hierarchy of any depth.
// The sync workflow employs DFS, initiating a separate workflow
// for each top-level content. Refer to `confluenceSyncTopLevelChildContentWorkflow`
// for implementation details.
export async function confluenceSpaceSyncWorkflow(
  params: ConfluenceSpaceSyncWorkflowInput
) {
  const { connectorId, spaceId } = params;

  const uniqueTopLevelContentRefs = new Map<string, ConfluenceContentRef>();
  const visitedAtMs = new Date().getTime();

  const wInfo = workflowInfo();

  const confluenceConfig = await fetchConfluenceConfigurationActivity(
    params.connectorId
  );
  const { cloudId: confluenceCloudId, url: baseUrl } = confluenceConfig;

  const space = await confluenceGetSpaceBlobActivity({
    ...params,
    confluenceCloudId: confluenceConfig?.cloudId,
  });
  // If the space does not exist, launch a workflow to remove the space.
  if (!space) {
    return startConfluenceRemoveSpaceWorkflow(wInfo, connectorId, spaceId);
  }

  await confluenceUpsertSpaceFolderActivity({
    connectorId,
    space,
    baseUrl,
  });

  const allowedRootContentIds = await fetchAndUpsertRootContentActivity({
    ...params,
    confluenceCloudId,
    space,
    visitedAtMs,
  });

  // Fetch all top-level content within a specified space. Top-level content
  // refer to those directly nested under the space's root content.
  for (const allowedRootContentId of allowedRootContentIds) {
    let nextPageCursor: string | null = "";
    do {
      const { topLevelContentRefs, nextPageCursor: nextCursor } =
        await confluenceGetTopLevelContentIdsActivity({
          confluenceCloudId,
          connectorId,
          pageCursor: nextPageCursor,
          rootContentId: allowedRootContentId,
          space,
        });

      nextPageCursor = nextCursor; // Prepare for the next iteration.

      topLevelContentRefs.forEach((c) =>
        uniqueTopLevelContentRefs.set(c.id, c)
      );
    } while (nextPageCursor !== null);
  }

  const { workflowId, searchAttributes: parentSearchAttributes, memo } = wInfo;

  const uniqueTopLevelContentRefsArray = Array.from(
    uniqueTopLevelContentRefs.values()
  );
  // For small spaces, process each content individually; for large spaces, chunk them to be
  // conservative.
  const topLevelContentRefsToProcess =
    uniqueTopLevelContentRefsArray.length > TOP_LEVEL_CONTENT_REFS_CHUNK_SIZE
      ? chunk(uniqueTopLevelContentRefsArray, TOP_LEVEL_CONTENT_REFS_CHUNK_SIZE)
      : uniqueTopLevelContentRefsArray.map((contentRef) => [contentRef]);

  for (const contentRefChunk of topLevelContentRefsToProcess) {
    // Start a new workflow to import the child content.
    await executeChild(confluenceSyncTopLevelChildContentWorkflow, {
      workflowId: makeConfluenceSyncTopLevelChildContentWorkflowIdFromParentId({
        parentWorkflowId: workflowId,
        topLevelContentId: contentRefChunk[0]?.id ?? "",
      }),
      searchAttributes: parentSearchAttributes,
      args: [
        {
          ...params,
          space,
          confluenceCloudId,
          visitedAtMs,
          topLevelContentRefs: contentRefChunk,
        },
      ],
      memo,
    });
  }

  await confluenceRemoveUnvisitedContentActivity({
    connectorId,
    lastVisitedAt: visitedAtMs,
    spaceId,
  });

  await confluenceUpdateContentParentIdsActivity(
    connectorId,
    spaceId,
    visitedAtMs
  );
}

type StackElement = ConfluenceContentRef | { parentId: string; cursor: string };

interface confluenceSyncTopLevelChildContentWorkflowInput {
  confluenceCloudId: string;
  connectorId: ModelId;
  forceUpsert: boolean;
  isBatchSync: boolean;
  space: SpaceBlob;
  topLevelContentRefs: StackElement[];
  visitedAtMs: number;
}

/**
 * This workflow implements a DFS algorithm to synchronize all pages not subject to restrictions.
 * It uses a stack to process pages and their children, with special handling for:
 *
 * 1. Pagination:
 *    - Regular content is processed and their children are added to the stack
 *    - Cursor elements in the stack represent continuation points for content with many children
 *
 * 2. Leaf pages optimization:
 *    - Content without children are batched together to reduce activity calls
 *    - Batches are automatically flushed when full or before workflow continuation
 *
 * This ensures we never store too many pages in the workflow history while maintaining proper
 * traversal and optimal performance.
 *
 * The workflow stops importing child content if a parent content is restricted.
 * Content restriction checks are performed by `confluenceCheckAndUpsertSingleContentActivity`.
 */
export async function confluenceSyncTopLevelChildContentWorkflow(
  params: confluenceSyncTopLevelChildContentWorkflowInput
) {
  const { space, topLevelContentRefs, visitedAtMs } = params;

  // Step 1: Setup.
  const stack: StackElement[] = [...topLevelContentRefs];
  let leafContentBatch: ConfluenceContentRef[] = [];

  // Step 2: Define a helper to "commit" the current batch of leaves.
  async function flushLeafContentBatch() {
    if (leafContentBatch.length > 0) {
      await confluenceUpsertLeafContentActivity({
        ...params,
        space,
        contentRefs: leafContentBatch,
        visitedAtMs,
      });
      leafContentBatch = [];
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      throw new Error("No more content to parse.");
    }

    // Check if it's an content reference or cursor.
    const isContentRef = "id" in current;

    // Step 3: If this is a real content and it has no children, buffer it for batch processing.
    if (isContentRef && !current.hasChildren) {
      leafContentBatch.push(current);

      // Check if we reached the threshold and, if so, flush the batch.
      if (leafContentBatch.length >= MAX_LEAF_PAGES_PER_BATCH) {
        await flushLeafContentBatch();
      }
      continue;
    }

    // Step 4: For content that do have children (or a cursor item), process them normally.
    if (isContentRef) {
      const successfullyUpsert =
        await confluenceCheckAndUpsertSingleContentActivity({
          ...params,
          space,
          contentRef: current,
          visitedAtMs,
        });

      if (!successfullyUpsert) {
        continue;
      }
    }

    // Get child content using either initial empty cursor or saved cursor.
    const childContentRefsRes =
      await confluenceGetActiveChildContentRefsActivity({
        ...params,
        parentContentId: isContentRef ? current.id : current.parentId,
        pageCursor: isContentRef ? "" : current.cursor,
      });

    if (!childContentRefsRes) {
      continue;
    }

    const { childContentRefs, nextPageCursor } = childContentRefsRes;

    // Add children and next cursor if there are more.
    stack.push(...childContentRefs);
    if (nextPageCursor !== null) {
      stack.push({
        parentId: isContentRef ? current.id : current.parentId,
        cursor: nextPageCursor,
      });
    }

    // Step 5: Check workflow size constraints, flush any batch, then continue as new if needed.
    const hasReachedWorkflowLimits =
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
      workflowInfo().historySize >
        TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024;
    if (
      hasReachedWorkflowLimits &&
      (stack.length > 0 ||
        childContentRefs.length > 0 ||
        nextPageCursor !== null)
    ) {
      await flushLeafContentBatch();

      await continueAsNew<typeof confluenceSyncTopLevelChildContentWorkflow>({
        ...params,
        topLevelContentRefs: stack,
      });
    }
  }

  await flushLeafContentBatch();
}

async function startConfluenceRemoveSpaceWorkflow(
  parentWorkflowInfo: WorkflowInfo,
  connectorId: ModelId,
  spaceId: string
) {
  const {
    memo,
    searchAttributes: parentSearchAttributes,
    workflowId,
  } = parentWorkflowInfo;

  await executeChild(confluenceRemoveSpaceWorkflow, {
    workflowId: makeConfluenceRemoveSpaceWorkflowIdFromParentId(
      workflowId,
      spaceId
    ),
    searchAttributes: parentSearchAttributes,
    args: [
      {
        connectorId,
        spaceId,
      },
    ],
    memo,
  });
}

// TODO(2024-01-19 flav) Build a factory to make workspace with a signal handler.
export async function confluenceRemoveSpacesWorkflow({
  connectorId,
  spaceIds,
}: {
  connectorId: ModelId;
  spaceIds: string[];
}) {
  let spaceIdsToDelete = spaceIds;
  if (spaceIds.length === 0) {
    spaceIdsToDelete = await fetchConfluenceSpaceIdsForConnectorActivity({
      connectorId,
    });
  }

  const uniqueSpaceIds = new Set(spaceIdsToDelete);

  setHandler(spaceUpdatesSignal, (spaceUpdates: SpaceUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing space ids.
    for (const { action, spaceId } of spaceUpdates) {
      if (action === "removed") {
        uniqueSpaceIds.add(spaceId);
      } else {
        uniqueSpaceIds.delete(spaceId);
      }
    }
  });

  const wInfo = workflowInfo();

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (uniqueSpaceIds.size > 0) {
    // Create a copy of the set to iterate over, to avoid issues with concurrent modification.
    const spaceIdsToProcess = new Set(uniqueSpaceIds);
    for (const spaceId of spaceIdsToProcess) {
      // Async operation yielding control to the Temporal runtime.
      await startConfluenceRemoveSpaceWorkflow(wInfo, connectorId, spaceId);

      // Remove the processed space from the original set after the async operation.
      uniqueSpaceIds.delete(spaceId);
    }
  }
}

export async function confluenceRemoveSpaceWorkflow({
  connectorId,
  spaceId,
}: {
  connectorId: ModelId;
  spaceId: string;
}) {
  await confluenceRemoveSpaceActivity(connectorId, spaceId);
}

export async function confluencePersonalDataReportingWorkflow() {
  const userAccountAndConnectorIds =
    await fetchConfluenceUserAccountAndConnectorIdsActivity();

  // TODO(2024-01-23 flav) Consider chunking array of userAccounts to speed things up.
  for (const blob of userAccountAndConnectorIds) {
    const shouldDeleteConnector =
      await confluenceGetReportPersonalActionActivity(blob);

    if (shouldDeleteConnector) {
      const { memo, searchAttributes: parentSearchAttributes } = workflowInfo();

      // If the account is closed, remove all associated Spaces and Pages from storage.
      await executeChild(confluenceRemoveSpacesWorkflow, {
        workflowId: makeConfluenceRemoveSpacesWorkflowId(blob.connectorId),
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId: blob.connectorId,
            spaceIds: [],
          },
        ],
        memo,
      });

      // TODO(2024-01-23 flav) Implement logic to remove row in the Connector table and stop all workflows.
    }
  }
}

export async function confluenceUpsertPageWithFullParentsWorkflow({
  connectorId,
  pageId,
}: {
  connectorId: ModelId;
  pageId: string;
}) {
  await confluenceUpsertPageWithFullParentsActivity({
    connectorId,
    pageId,
  });
}

export async function confluenceUpsertPagesWithFullParentsWorkflow({
  connectorId,
  pageIds,
}: {
  connectorId: ModelId;
  pageIds: string[];
}) {
  const cachedSpaceNames: Record<string, string> = {};
  const cachedSpaceHierarchies: Record<
    string,
    Record<string, ConfluenceContentWithType>
  > = {};

  for (const pageId of pageIds) {
    await confluenceUpsertPageWithFullParentsActivity({
      connectorId,
      pageId,
      cachedSpaceNames,
      cachedSpaceHierarchies,
    });
  }
}

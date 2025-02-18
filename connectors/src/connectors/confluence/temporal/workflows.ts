import type { ModelId } from "@dust-tt/types";
import type { WorkflowInfo } from "@temporalio/workflow";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type { ConfluencePageRef } from "@connectors/connectors/confluence/lib/confluence_api";
import type * as activities from "@connectors/connectors/confluence/temporal/activities";
import type { SpaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import { spaceUpdatesSignal } from "@connectors/connectors/confluence/temporal/signals";
import {
  makeConfluenceRemoveSpacesWorkflowId,
  makeConfluenceRemoveSpaceWorkflowIdFromParentId,
  makeConfluenceSpaceSyncWorkflowIdFromParentId,
  makeConfluenceSyncTopLevelChildPagesWorkflowIdFromParentId,
} from "@connectors/connectors/confluence/temporal/workflow_ids";

const {
  confluenceGetSpaceNameActivity,
  confluenceGetTopLevelPageIdsActivity,
  confluenceRemoveSpaceActivity,
  confluenceRemoveUnvisitedPagesActivity,
  confluenceSaveStartSyncActivity,
  confluenceSaveSuccessSyncActivity,
  confluenceUpdatePagesParentIdsActivity,
  confluenceCheckAndUpsertPageActivity,
  confluenceGetActiveChildPageRefsActivity,
  fetchConfluenceSpaceIdsForConnectorActivity,
  confluenceUpsertPageWithFullParentsActivity,

  confluenceGetReportPersonalActionActivity,
  fetchConfluenceUserAccountAndConnectorIdsActivity,

  fetchConfluenceConfigurationActivity,
  confluenceUpsertSpaceFolderActivity,

  fetchAndUpsertRootPagesActivity,

  getSpaceIdsToSyncActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: {
    initialInterval: "60 seconds",
    backoffCoefficient: 2,
    maximumInterval: "3600 seconds",
  },
});

// Set a conservative threshold to start a new workflow and
// avoid exceeding Temporal's max workflow size limit,
// since a Confluence page can have an unbounded number of pages.
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;
const TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB = 10;

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

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (spaceIdsMap.size > 0) {
    // Create a copy of the map to iterate over, to avoid issues with concurrent modification.
    const spaceIdsToProcess = new Map(spaceIdsMap);
    for (const [spaceId, opts] of spaceIdsToProcess) {
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
// - A single root page defining the space's entry point.
// - Top level pages directly nested under the root page.
// Each top-level page can have a hierarchy of any depth.
// The sync workflow employs DFS, initiating a separate workflow
// for each top-level page. Refer to `confluenceSyncTopLevelChildPagesWorkflow`
// for implementation details.
export async function confluenceSpaceSyncWorkflow(
  params: ConfluenceSpaceSyncWorkflowInput
) {
  const { connectorId, spaceId } = params;

  const uniqueTopLevelPageRefs = new Map<string, ConfluencePageRef>();
  const visitedAtMs = new Date().getTime();

  const wInfo = workflowInfo();

  const confluenceConfig = await fetchConfluenceConfigurationActivity(
    params.connectorId
  );
  const { cloudId: confluenceCloudId, url: baseUrl } = confluenceConfig;

  const spaceName = await confluenceGetSpaceNameActivity({
    ...params,
    confluenceCloudId: confluenceConfig?.cloudId,
  });
  // If the space does not exist, launch a workflow to remove the space.
  if (spaceName === null) {
    return startConfluenceRemoveSpaceWorkflow(wInfo, connectorId, spaceId);
  }

  await confluenceUpsertSpaceFolderActivity({
    connectorId,
    spaceId,
    spaceName,
    baseUrl,
  });

  const allowedRootPageIds = await fetchAndUpsertRootPagesActivity({
    ...params,
    confluenceCloudId,
    spaceName,
    visitedAtMs,
  });

  // Fetch all top-level pages within a specified space. Top-level pages
  // refer to those directly nested under the space's root pages.
  for (const allowedRootPageId of allowedRootPageIds) {
    let nextPageCursor: string | null = "";
    do {
      const { topLevelPageRefs, nextPageCursor: nextCursor } =
        await confluenceGetTopLevelPageIdsActivity({
          confluenceCloudId,
          connectorId,
          pageCursor: nextPageCursor,
          rootPageId: allowedRootPageId,
          spaceId,
        });

      nextPageCursor = nextCursor; // Prepare for the next iteration.

      topLevelPageRefs.forEach((r) => uniqueTopLevelPageRefs.set(r.id, r));
    } while (nextPageCursor !== null);
  }

  const { workflowId, searchAttributes: parentSearchAttributes, memo } = wInfo;
  for (const pageRef of uniqueTopLevelPageRefs.values()) {
    // Start a new workflow to import the child pages.
    await executeChild(confluenceSyncTopLevelChildPagesWorkflow, {
      workflowId: makeConfluenceSyncTopLevelChildPagesWorkflowIdFromParentId(
        workflowId,
        pageRef.id
      ),
      searchAttributes: parentSearchAttributes,
      args: [
        {
          ...params,
          spaceName,
          confluenceCloudId,
          visitedAtMs,
          topLevelPageRefs: [pageRef],
        },
      ],
      memo,
    });
  }

  await confluenceRemoveUnvisitedPagesActivity({
    connectorId,
    lastVisitedAt: visitedAtMs,
    spaceId,
  });

  await confluenceUpdatePagesParentIdsActivity(
    connectorId,
    spaceId,
    visitedAtMs
  );
}

type StackElement = ConfluencePageRef | { parentId: string; cursor: string };

interface confluenceSyncTopLevelChildPagesWorkflowInput {
  confluenceCloudId: string;
  connectorId: ModelId;
  forceUpsert: boolean;
  isBatchSync: boolean;
  spaceId: string;
  spaceName: string;
  topLevelPageRefs: StackElement[];
  visitedAtMs: number;
}

/**
 * This workflow implements a DFS algorithm to synchronize all pages not subject to restrictions.
 * It uses a stack to process pages and their children, with a special handling for pagination:
 * - Regular pages are processed and their children are added to the stack
 * - Cursor elements in the stack represent continuation points for pages with many children
 * This ensures we never store too many pages in the workflow history while maintaining proper
 * traversal.
 *
 * The workflow stops importing child pages if a parent page is restricted.
 * Page restriction checks are performed by `confluenceCheckAndUpsertPageActivity`.
 */
export async function confluenceSyncTopLevelChildPagesWorkflow(
  params: confluenceSyncTopLevelChildPagesWorkflowInput
) {
  const { spaceName, topLevelPageRefs, visitedAtMs } = params;
  const stack: StackElement[] = [...topLevelPageRefs];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      throw new Error("No more pages to parse.");
    }

    // Check if it's a page reference or cursor.
    const isPageRef = "id" in current;

    // If it's a page, process it first.
    if (isPageRef) {
      const successfullyUpsert = await confluenceCheckAndUpsertPageActivity({
        ...params,
        spaceName,
        pageRef: current,
        visitedAtMs,
      });
      if (!successfullyUpsert) {
        continue;
      }
    }

    // Only attempt to fetch children if the page has known children.
    if (isPageRef && !current.hasChildren) {
      continue;
    }

    // Get child pages using either initial empty cursor or saved cursor.
    const { childPageRefs, nextPageCursor } =
      await confluenceGetActiveChildPageRefsActivity({
        ...params,
        parentPageId: isPageRef ? current.id : current.parentId,
        pageCursor: isPageRef ? "" : current.cursor,
      });

    // Add children and next cursor if there are more.
    stack.push(...childPageRefs);
    if (nextPageCursor !== null) {
      stack.push({
        parentId: isPageRef ? current.id : current.parentId,
        cursor: nextPageCursor,
      });
    }

    // Check if we would exceed limits by continuing.
    const hasReachedWorkflowLimits =
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH ||
      workflowInfo().historySize >
        TEMPORAL_WORKFLOW_MAX_HISTORY_SIZE_MB * 1024 * 1024;
    if (
      hasReachedWorkflowLimits &&
      (stack.length > 0 || childPageRefs.length > 0 || nextPageCursor !== null)
    ) {
      await continueAsNew<typeof confluenceSyncTopLevelChildPagesWorkflow>({
        ...params,
        topLevelPageRefs: stack,
      });
    }
  }
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
    Record<string, string | null>
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

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
  confluenceGetRootPageRefsActivity,
  fetchConfluenceSpaceIdsForConnectorActivity,
  confluenceUpsertPageWithFullParentsActivity,

  confluenceGetReportPersonalActionActivity,
  fetchConfluenceUserAccountAndConnectorIdsActivity,

  fetchConfluenceConfigurationActivity,
  confluenceUpsertSpaceFolderActivity,
  getSpaceIdsToSyncActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

// Set a conservative threshold to start a new workflow and
// avoid exceeding Temporal's max workflow size limit,
// since a Confluence page can have an unbounded number of pages.
const TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH = 10_000;

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
  const { cloudId: confluenceCloudId } = confluenceConfig;

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
  });

  // Get the root level pages for the space.
  const rootPageRefs = await confluenceGetRootPageRefsActivity({
    connectorId,
    confluenceCloudId,
    spaceId,
  });
  if (rootPageRefs.length === 0) {
    return;
  }

  const allowedRootPageRefs = new Map<string, ConfluencePageRef>(
    rootPageRefs.map((r) => [r.id, r])
  );

  // Upsert the root pages.
  for (const rootPageRef of allowedRootPageRefs.values()) {
    const successfullyUpsert = await confluenceCheckAndUpsertPageActivity({
      ...params,
      spaceName,
      pageRef: rootPageRef,
      visitedAtMs,
    });

    // If the page fails the upsert operation, it indicates the page is restricted.
    // Such pages should be excluded from the list of allowed pages.
    if (!successfullyUpsert) {
      allowedRootPageRefs.delete(rootPageRef.id);
    }
  }

  // Fetch all top-level pages within a specified space. Top-level pages
  // refer to those directly nested under the space's root pages.
  for (const allowedRootPageId of allowedRootPageRefs.keys()) {
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

interface confluenceSyncTopLevelChildPagesWorkflowInput {
  confluenceCloudId: string;
  connectorId: ModelId;
  forceUpsert: boolean;
  isBatchSync: boolean;
  spaceId: string;
  spaceName: string;
  topLevelPageRefs: ConfluencePageRef[];
  visitedAtMs: number;
}

// This Workflow implements a DFS algorithm to synchronize all pages not
// subject to restrictions. It stops importing child pages
// if a parent page is restricted.
// Page restriction checks are performed by `confluenceCheckAndUpsertPageActivity`;
// where false denotes restriction. Children of unrestricted pages are
// stacked for subsequent import.
export async function confluenceSyncTopLevelChildPagesWorkflow(
  params: confluenceSyncTopLevelChildPagesWorkflowInput
) {
  const { spaceName, topLevelPageRefs, visitedAtMs } = params;
  const stack = [...topLevelPageRefs];

  while (stack.length > 0) {
    const currentPageRef = stack.pop();
    if (!currentPageRef) {
      throw new Error("No more pages to parse.");
    }

    const successfullyUpsert = await confluenceCheckAndUpsertPageActivity({
      ...params,
      spaceName,
      pageRef: currentPageRef,
      visitedAtMs,
    });
    if (!successfullyUpsert) {
      continue;
    }

    // Fetch child pages of the current top level page.
    let nextPageCursor: string | null = "";
    do {
      const { childPageRefs, nextPageCursor: nextCursor } =
        await confluenceGetActiveChildPageRefsActivity({
          ...params,
          parentPageId: currentPageRef.id,
          pageCursor: nextPageCursor,
        });

      nextPageCursor = nextCursor; // Prepare for the next iteration.

      stack.push(...childPageRefs);
    } while (nextPageCursor !== null);

    // If additional pages are pending and workflow limits are reached, continue in a new workflow.
    if (
      stack.length > 0 &&
      workflowInfo().historyLength > TEMPORAL_WORKFLOW_MAX_HISTORY_LENGTH
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

import {
  makeGongGarbageCollectionWorkflowIdFromParentId,
  makeGongSyncTranscriptsWorkflowIdFromParentId,
} from "@connectors/connectors/gong/lib/internal_ids";
import type * as activities from "@connectors/connectors/gong/temporal/activities";
import type { ModelId } from "@connectors/types";
import {
  ActivityCancellationType,
  executeChild,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

const {
  gongCheckGarbageCollectionStateActivity,
  gongDeleteExcludedTranscriptsActivity,
  gongDeleteOutdatedTranscriptsActivity,
  gongListAndSaveUsersActivity,
  gongSaveGarbageCollectionSuccessActivity,
  gongSaveStartSyncActivity,
  gongSaveSyncSuccessActivity,
  gongSyncTranscriptsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes",
  cancellationType: ActivityCancellationType.TRY_CANCEL,
});

const { gongUnpauseScheduleActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function gongSyncWorkflow({
  connectorId,
  forceResync,
}: {
  connectorId: ModelId;
  fromTs: number | null;
  forceResync: boolean;
}) {
  await gongSaveStartSyncActivity({ connectorId });

  // Only syncs the users if we are not resuming from a previous sync.
  // New users will be added through the transcript incremental sync.
  await gongListAndSaveUsersActivity({ connectorId });

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  // Record the start of the sync.
  const syncStartTs = Date.now();

  // Then, we start a child workflow to sync the transcripts.
  await executeChild(gongSyncTranscriptsWorkflow, {
    workflowId: makeGongSyncTranscriptsWorkflowIdFromParentId(workflowId),
    searchAttributes: parentSearchAttributes,
    args: [
      {
        connectorId,
        forceResync,
      },
    ],
    memo,
  });

  // Finally, we save the end of the sync and update the last sync timestamp.
  await gongSaveSyncSuccessActivity({
    connectorId,
    lastSyncTimestamp: syncStartTs,
  });

  const garbageCollectionStartTs = Date.now();

  const { shouldRunGarbageCollection } =
    await gongCheckGarbageCollectionStateActivity({
      connectorId,
      currentTimestamp: garbageCollectionStartTs,
    });

  // We start a child workflow for the garbage collection of outdated transcripts.
  if (shouldRunGarbageCollection) {
    await executeChild(gongGarbageCollectWorkflow, {
      workflowId: makeGongGarbageCollectionWorkflowIdFromParentId(workflowId),
      searchAttributes: parentSearchAttributes,
      args: [
        {
          connectorId,
          garbageCollectionStartTs,
        },
      ],
      memo,
    });

    await gongSaveGarbageCollectionSuccessActivity({
      connectorId,
      lastGarbageCollectionTimestamp: garbageCollectionStartTs,
    });
  }
}

export async function gongSyncTranscriptsWorkflow({
  connectorId,
  forceResync,
}: {
  connectorId: ModelId;
  forceResync: boolean;
}) {
  let pageCursor: string | null = null;
  let currentRecordCount = 0;

  // Do an outer loop to sync all the transcripts. To avoid hitting activity startToCloseTimeout.
  do {
    const { nextPageCursor, processedRecords } =
      await gongSyncTranscriptsActivity({
        connectorId,
        forceResync,
        pageCursor,
        currentRecordCount,
      });

    pageCursor = nextPageCursor;
    currentRecordCount += processedRecords;
  } while (pageCursor !== null);
}

export async function gongGarbageCollectWorkflow({
  connectorId,
  garbageCollectionStartTs,
}: {
  connectorId: ModelId;
  garbageCollectionStartTs: number;
}) {
  let hasMoreTranscripts: boolean | null = null;

  // Do an outer loop to garbage collect all outdated transcripts and avoid hitting the activity startToCloseTimeout
  // Enabling a retention policy can lead to having many transcripts to remove.
  do {
    const { hasMore } = await gongDeleteOutdatedTranscriptsActivity({
      connectorId,
      garbageCollectionStartTs,
    });
    hasMoreTranscripts = hasMore;
  } while (hasMoreTranscripts);
}

/**
 * Deletes transcripts matching exclude keywords.
 */
export async function gongCleanupExcludedTranscriptsWorkflow({
  connectorId,
  excludeKeywords,
}: {
  connectorId: ModelId;
  excludeKeywords: string[];
}) {
  let hasMore = true;
  let lastId: number | undefined = undefined;

  while (hasMore) {
    const result = await gongDeleteExcludedTranscriptsActivity({
      connectorId,
      excludeKeywords,
      lastId,
    });

    hasMore = result.hasMore;
    lastId = result.lastId ?? undefined;
  }
}

/**
 * Orchestrates keyword update cleanup after schedule is paused:
 * 1. Wait for in-flight activities to complete
 * 2. Clean up excluded transcripts
 * 3. Resume schedule
 *
 * Note: Schedule pause happens in the API handler before this workflow starts.
 */
export async function gongKeywordUpdateWorkflow({
  connectorId,
  newKeywords,
}: {
  connectorId: ModelId;
  newKeywords: string[];
}) {
  const { workflowId, searchAttributes, memo } = workflowInfo();

  // Wait for in-flight activities to finish
  await sleep("60 seconds");

  await executeChild(gongCleanupExcludedTranscriptsWorkflow, {
    workflowId: `${workflowId}-cleanup`,
    args: [{ connectorId, excludeKeywords: newKeywords }],
    searchAttributes,
    memo,
  });

  await gongUnpauseScheduleActivity({ connectorId });
}

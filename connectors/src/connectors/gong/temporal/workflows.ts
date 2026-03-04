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
 * Orchestrates keyword update cleanup after schedule is paused.
 * Cleans up excluded transcripts in batches.
 *
 * Note: Schedule pause, maxTranscriptId capture, and 90-second delay happen
 * before this workflow starts. The schedule is resumed after completion.
 */
export async function gongKeywordUpdateWorkflow({
  connectorId,
  newKeywords,
  maxTranscriptId,
}: {
  connectorId: ModelId;
  newKeywords: string[];
  maxTranscriptId: ModelId;
}) {
  // Clean up excluded transcripts in batches
  let hasMore = true;
  let lastId: number | undefined = undefined;

  while (hasMore) {
    const result = await gongDeleteExcludedTranscriptsActivity({
      connectorId,
      excludeKeywords: newKeywords,
      lastId,
      maxTranscriptId,
    });

    hasMore = result.hasMore;
    lastId = result.lastId ?? undefined;
  }
}

import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import {
  makeGongGarbageCollectionWorkflowIdFromParentId,
  makeGongSyncTranscriptsWorkflowIdFromParentId,
} from "@connectors/connectors/gong/lib/internal_ids";
import type * as activities from "@connectors/connectors/gong/temporal/activities";

const {
  gongListAndSaveUsersActivity,
  gongSaveStartSyncActivity,
  gongSaveSyncSuccessActivity,
  gongCheckGarbageCollectionStateActivity,
  gongSaveGarbageCollectionSuccessActivity,
  gongSyncTranscriptsActivity,
  gongDeleteOutdatedTranscriptsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

export async function gongSyncWorkflow({
  connectorId,
  fromTs,
  forceResync,
}: {
  connectorId: ModelId;
  fromTs: number | null;
  forceResync: boolean;
}) {
  await gongSaveStartSyncActivity({ connectorId });

  // Only run the users sync if we are not resuming from a previous sync. New users will be added
  // through the transcripts incremental sync.
  if (!fromTs) {
    await gongListAndSaveUsersActivity({ connectorId });
  }

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

  // Do an outer loop to sync all the transcripts. To avoid hitting activity startToCloseTimeout.
  do {
    const { nextPageCursor } = await gongSyncTranscriptsActivity({
      connectorId,
      forceResync,
      pageCursor,
    });

    pageCursor = nextPageCursor;
  } while (pageCursor !== null);
}

export async function gongGarbageCollectWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await gongDeleteOutdatedTranscriptsActivity({ connectorId });
}

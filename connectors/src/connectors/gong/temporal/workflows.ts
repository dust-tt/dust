import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/gong/temporal/activities";

const {
  gongListAndSaveUsersActivity,
  gongSaveStartSyncActivity,
  gongSaveSyncSuccessActivity,
  gongSyncTranscriptsActivity,
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

  // Then, we save the transcripts.
  await gongSyncTranscriptsActivity({ connectorId, forceResync });

  // Finally, we save the end of the sync.
  await gongSaveSyncSuccessActivity({ connectorId });
}

import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/gong/temporal/activities";

const {
  gongSyncTranscriptsActivity,
  gongSaveStartSyncActivity,
  gongSaveSyncSuccessActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

export async function gongSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await gongSaveStartSyncActivity(connectorId);
  await gongSyncTranscriptsActivity(connectorId);
  await gongSaveSyncSuccessActivity(connectorId);
}

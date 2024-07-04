import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const { fullSyncActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

const { getNodesToSync, syncSucceeded } = proxyActivities<typeof sync_status>({
  startToCloseTimeout: "10 minutes",
});

export async function fullSyncWorkflow({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}) {
  await fullSyncActivity({ connectorId, dataSourceConfig });
  await syncSucceeded(connectorId);
}

export async function fullSyncSitesWorkflow({
  connectorId,
  nodesToBrowse = undefined,
  totalCount = 0,
  startSyncTs = undefined,
}: {
  connectorId: ModelId;
  nodesToBrowse?: string[];
  totalCount: number;
  startSyncTs?: number;
}) {
  if (nodesToBrowse === undefined) {
    nodesToBrowse = await getFoldersToSync(connectorId);
  }

  while (nodesToBrowse.length > 0) {
    const folder = nodesToBrowse.pop();
    if (!folder) {
      throw new Error("folderId should be defined");
    }
    do {
      const res = await syncFiles(
        connectorId,
        folder,
        startSyncTs,
        nextPageToken,
        mimeTypeFilter
      );
      nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
      totalCount += res.count;
      nodesToBrowse = nodesToBrowse.concat(res.subfolders);

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageToken);
    await markFolderAsVisited(connectorId, folder);
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof googleDriveFullSync>({
        connectorId,
        garbageCollect,
        foldersToBrowse: nodesToBrowse,
        totalCount,
        startSyncTs,
        mimeTypeFilter,
      });
    }
  }

  await syncSucceeded(connectorId);
}

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}

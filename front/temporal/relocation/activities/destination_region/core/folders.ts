import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  CoreFolderAPIRelocationBlob,
  CreateDataSourceProjectResult,
} from "@app/temporal/relocation/activities/types";
import { CORE_API_CONCURRENCY_LIMIT } from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { CoreAPI } from "@app/types";

export async function processDataSourceFolders({
  destIds,
  dataPath,
  destRegion,
  sourceRegion,
  sourceRegionDustFacingUrl,
  workspaceId,
}: {
  destIds: CreateDataSourceProjectResult;
  dataPath: string;
  destRegion: RegionType;
  sourceRegion: RegionType;
  sourceRegionDustFacingUrl: string;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    destRegion,
    sourceRegion,
    workspaceId,
  });

  localLogger.info("[Core] Processing data source folders");

  const data =
    await readFromRelocationStorage<CoreFolderAPIRelocationBlob>(dataPath);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const destRegionDustFacingUrl = config.getClientFacingUrl();

  const res = await concurrentExecutor(
    data.blobs.folders,
    async (d) => {
      // If the source URL starts with the source region Dust URL, replace it with the destination region Dust URL.
      const sourceUrl =
        d.source_url && d.source_url.startsWith(sourceRegionDustFacingUrl)
          ? d.source_url.replace(
              sourceRegionDustFacingUrl,
              destRegionDustFacingUrl
            )
          : d.source_url;

      return coreAPI.upsertDataSourceFolder({
        dataSourceId: destIds.dustAPIDataSourceId,
        folderId: d.node_id,
        mimeType: d.mime_type,
        parentId: d.parent_id ?? null,
        parents: d.parents,
        projectId: destIds.dustAPIProjectId,
        providerVisibility: d.provider_visibility,
        sourceUrl,
        timestamp: d.timestamp,
        title: d.title,
      });
    },
    { concurrency: CORE_API_CONCURRENCY_LIMIT }
  );

  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    localLogger.error(
      { failed },
      "[Core] Failed to process data source folders"
    );

    throw new Error("Failed to process data source folders");
  }

  localLogger.info("[Core] Processed data source folders");

  await deleteFromRelocationStorage(dataPath);
}

import config from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import type { RegionType } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import type {
  CoreDocumentAPIRelocationBlob,
  CreateDataSourceProjectResult,
} from "@app/temporal/relocation/activities/types";
import { CORE_API_CONCURRENCY_LIMIT } from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import {
  concurrentExecutor,
  CoreAPI,
  dustManagedCredentials,
} from "@app/types";

export async function processDataSourceDocuments({
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

  localLogger.info("[Core] Processing data source documents");

  const data =
    await readFromRelocationStorage<CoreDocumentAPIRelocationBlob>(dataPath);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const credentials = dustManagedCredentials();
  const destRegionDustFacingUrl = config.getClientFacingUrl();

  const res = await concurrentExecutor(
    data.blobs.documents,
    async (d) => {
      // If the source URL starts with the source region Dust URL, replace it with the destination region Dust URL.
      const sourceUrl =
        d.source_url && d.source_url.startsWith(sourceRegionDustFacingUrl)
          ? d.source_url.replace(
              sourceRegionDustFacingUrl,
              destRegionDustFacingUrl
            )
          : d.source_url;

      // There are some issues with the parents field.
      // parents[0] should be the document_id, but it's not always the case.
      // If we change the parents[0] to the document_id, then parents[1] should be the parent_id.
      let parents: string[] = [];
      let parentId: string | null = d.parent_id ?? null;
      if (d.parents.length > 0) {
        if (d.parents[0] !== d.document_id) {
          parents = [d.document_id, ...d.parents];
          parentId = parents[1];
        } else {
          parents = d.parents;
        }
      } else {
        parents = [d.document_id];
      }

      const title = !d.title || d.title.length === 0 ? UNTITLED_TITLE : d.title;

      return coreAPI.upsertDataSourceDocument({
        // Override the project and data source ids to the ones in the destination region.
        projectId: destIds.dustAPIProjectId,
        dataSourceId: destIds.dustAPIDataSourceId,
        documentId: d.document_id,
        timestamp: d.timestamp,
        tags: d.tags,
        parentId,
        parents,
        sourceUrl,
        section: d.section,
        credentials,
        lightDocumentOutput: true,
        title,
        mimeType: d.mime_type,
      });
    },
    { concurrency: CORE_API_CONCURRENCY_LIMIT }
  );

  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    localLogger.error(
      { failed },
      "[Core] Failed to process data source documents"
    );

    throw new Error("Failed to process data source documents");
  }

  localLogger.info("[Core] Processed data source documents");

  await deleteFromRelocationStorage(dataPath);
}

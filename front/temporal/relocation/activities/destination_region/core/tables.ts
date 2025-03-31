import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  CoreTableAPIRelocationBlob,
  CreateDataSourceProjectResult,
} from "@app/temporal/relocation/activities/types";
import { CORE_API_CONCURRENCY_LIMIT } from "@app/temporal/relocation/activities/types";
import {
  deleteFromRelocationStorage,
  readFromRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import { CoreAPI } from "@app/types";

export async function processDataSourceTables({
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

  localLogger.info("[Core] Processing data source tables");

  const data =
    await readFromRelocationStorage<CoreTableAPIRelocationBlob>(dataPath);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const destRegionDustFacingUrl = config.getClientFacingUrl();

  const res = await concurrentExecutor(
    data.blobs.tables,
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
      // parents[0] should be the table_id, but it's not always the case.
      // If we change the parents[0] to the table_id, then parents[1] should be the parent_id.
      let parents: string[] = [];
      let parentId: string | null = d.parent_id ?? null;
      if (d.parents.length > 0) {
        if (d.parents[0] !== d.table_id) {
          parents = [d.table_id, ...d.parents];
          parentId = parents[1];
        } else {
          parents = d.parents;
        }
      } else {
        parents = [d.table_id];
      }

      const title = d.title.trim() || d.name;

      // 1) Upsert the table.
      const upsertRes = await coreAPI.upsertTable({
        projectId: destIds.dustAPIProjectId,
        dataSourceId: destIds.dustAPIDataSourceId,
        tableId: d.table_id,
        name: d.name,
        description: d.description,
        timestamp: d.timestamp,
        tags: d.tags,
        parentId,
        parents,
        remoteDatabaseTableId: d.remote_database_table_id,
        remoteDatabaseSecretId: d.remote_database_secret_id,
        title,
        mimeType: d.mime_type,
        sourceUrl: sourceUrl ?? null,
      });

      if (upsertRes.isErr()) {
        localLogger.error(
          {
            error: upsertRes.error,
            tableId: d.table_id,
          },
          "[Core] Failed to upsert table"
        );
        return upsertRes;
      }

      // Return early if there are no rows to upsert.
      if (d.rows.length === 0) {
        return upsertRes;
      }

      // 2) Upsert the table rows.
      const rowsRes = await coreAPI.upsertTableRows({
        projectId: destIds.dustAPIProjectId,
        dataSourceId: destIds.dustAPIDataSourceId,
        tableId: d.table_id,
        rows: d.rows,
      });

      if (rowsRes.isErr()) {
        localLogger.error(
          {
            error: rowsRes.error,
            tableId: d.table_id,
          },
          "[Core] Failed to upsert table rows"
        );
        return rowsRes;
      }

      return rowsRes;
    },
    { concurrency: CORE_API_CONCURRENCY_LIMIT }
  );

  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    localLogger.error(
      { failed },
      "[Core] Failed to process data source tables"
    );

    throw new Error("Failed to process data source tables");
  }

  localLogger.info("[Core] Processed data source tables");

  await deleteFromRelocationStorage(dataPath);
}

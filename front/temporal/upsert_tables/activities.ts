import { Storage } from "@google-cloud/storage";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { upsertTableFromCsv } from "@app/lib/api/tables";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { WorkflowError } from "@app/lib/temporal_monitoring";
import { EnqueueUpsertTable } from "@app/lib/upsert_queue";
import mainLogger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import config from "@app/temporal/config";

export async function upsertTableActivity(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  const storage = new Storage({ keyFilename: config.getServiceAccount() });
  const bucket = storage.bucket(config.getUpsertQueueBucket());
  const content = await bucket.file(`${upsertQueueId}.json`).download();

  const upsertDocument = JSON.parse(content.toString());

  const tableItemValidation = EnqueueUpsertTable.decode(upsertDocument);

  if (isLeft(tableItemValidation)) {
    const pathErrorTable = reporter.formatValidationErrors(
      tableItemValidation.left
    );
    throw new Error(`Invalid upsertQueue table: ${pathErrorTable}`);
  }

  const upsertQueueItem = tableItemValidation.right;
  const logger = mainLogger.child({
    upsertQueueId,
    workspaceId: upsertQueueItem.workspaceId,
    dataSourceId: upsertQueueItem.dataSourceId,
    tableId: upsertQueueItem.tableId,
  });

  const auth = await Authenticator.internalAdminForWorkspace(
    upsertQueueItem.workspaceId
  );

  const owner = auth.workspace();
  if (!owner) {
    logger.error(
      {
        delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
      },
      "[UpsertQueue] Giving up: Workspace not found"
    );
    return;
  }

  const dataSource = await DataSourceResource.fetchById(
    auth,
    upsertQueueItem.dataSourceId
  );
  if (!dataSource) {
    // If the data source was not found, we simply give up and remove the item from the queue as it
    // means that the data source was deleted.
    logger.info(
      {
        delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
      },
      "[UpsertQueue] Giving up: DataSource not found"
    );
    return;
  }

  const statsDTags = [
    `data_source_name:${dataSource.name}`,
    `workspace_id:${upsertQueueItem.workspaceId}`,
  ];

  const upsertTimestamp = Date.now();

  const tableRes = await upsertTableFromCsv({
    auth,
    dataSource,
    tableName: upsertQueueItem.tableName,
    tableDescription: upsertQueueItem.tableDescription,
    tableId: upsertQueueItem.tableId,
    tableTimestamp: upsertQueueItem.tableTimestamp ?? null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    tableTags: upsertQueueItem.tableTags || [],
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    tableParentId: upsertQueueItem.tableParentId || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    tableParents: upsertQueueItem.tableParents || [],
    fileId: upsertQueueItem.fileId ?? null,
    truncate: upsertQueueItem.truncate,
    title: upsertQueueItem.title,
    mimeType: upsertQueueItem.mimeType,
    sourceUrl: upsertQueueItem.sourceUrl ?? null,
  });

  if (tableRes.isErr()) {
    logger.error(
      {
        error: tableRes.error,
        latencyMs: Date.now() - upsertTimestamp,
        delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        csvSize: upsertQueueItem.csv?.length || 0,
      },
      "[UpsertQueue] Failed table upsert"
    );
    statsDClient.increment("upsert_queue_table_error.count", 1, statsDTags);
    statsDClient.distribution(
      "upsert_queue_upsert_table_error.duration.distribution",
      Date.now() - upsertTimestamp,
      []
    );

    const error: WorkflowError = {
      __is_dust_error: true,
      message: `Upsert error: ${JSON.stringify(tableRes.error)}`,
      type: "upsert_queue_upsert_table_error",
    };

    throw error;
  }

  logger.info(
    {
      latencyMs: Date.now() - upsertTimestamp,
      delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      csvSize: upsertQueueItem.csv?.length || 0,
    },
    "[UpsertQueue] Successful table upsert"
  );
  statsDClient.increment("upsert_queue_table_success.count", 1, statsDTags);
  statsDClient.distribution(
    "upsert_queue_upsert_table_success.duration.distribution",
    Date.now() - upsertTimestamp,
    []
  );
  statsDClient.distribution(
    "upsert_queue_table.duration.distribution",
    Date.now() - enqueueTimestamp,
    []
  );
}

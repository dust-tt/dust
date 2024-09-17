import { CoreAPI, dustManagedCredentials } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import config from "@app/lib/api/config";
import { upsertTableFromCsv } from "@app/lib/api/tables";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { WorkflowError } from "@app/lib/temporal_monitoring";
import {
  EnqueueUpsertDocument,
  EnqueueUpsertTable,
  runPostUpsertHooks,
} from "@app/lib/upsert_queue";
import mainLogger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";

const { DUST_UPSERT_QUEUE_BUCKET, SERVICE_ACCOUNT } = process.env;

export async function upsertDocumentActivity(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  if (!DUST_UPSERT_QUEUE_BUCKET) {
    throw new Error("DUST_UPSERT_QUEUE_BUCKET is not set");
  }
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set");
  }

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });
  const bucket = storage.bucket(DUST_UPSERT_QUEUE_BUCKET);
  const content = await bucket.file(`${upsertQueueId}.json`).download();

  const upsertDocument = JSON.parse(content.toString());

  const documentItemValidation = EnqueueUpsertDocument.decode(upsertDocument);

  if (isLeft(documentItemValidation)) {
    const pathErrorDocument = reporter.formatValidationErrors(
      documentItemValidation.left
    );
    throw new Error(`Invalid upsertQueue document: ${pathErrorDocument}`);
  }

  const upsertQueueItem = documentItemValidation.right;

  const logger = mainLogger.child({
    upsertQueueId,
    workspaceId: upsertQueueItem.workspaceId,
    dataSourceId: upsertQueueItem.dataSourceId,
    documentId: upsertQueueItem.documentId,
  });

  const auth = await Authenticator.internalAdminForWorkspace(
    upsertQueueItem.workspaceId
  );

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    upsertQueueItem.dataSourceId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "upsert_queue_activities" }
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

  // Data source operations are performed with our credentials.
  const credentials = dustManagedCredentials();

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const upsertTimestamp = Date.now();

  // Create document with the Dust internal API.
  const upsertRes = await coreAPI.upsertDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: upsertQueueItem.documentId,
    tags: upsertQueueItem.tags || [],
    parents: upsertQueueItem.parents || [],
    sourceUrl: upsertQueueItem.sourceUrl,
    timestamp: upsertQueueItem.timestamp,
    section: upsertQueueItem.section,
    credentials,
    lightDocumentOutput: true,
  });

  if (upsertRes.isErr()) {
    logger.error(
      {
        error: upsertRes.error,
        latencyMs: Date.now() - upsertTimestamp,
        delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
      },
      "[UpsertQueue] Failed document upsert"
    );
    statsDClient.increment("upsert_queue_document_error.count", 1, statsDTags);
    statsDClient.distribution(
      "upsert_queue_upsert_document_error.duration.distribution",
      Date.now() - upsertTimestamp,
      []
    );

    const error: WorkflowError = {
      __is_dust_error: true,
      message: `Upsert error: ${upsertRes.error.message}`,
      type: "upsert_queue_upsert_document_error",
    };

    throw error;
  }

  logger.info(
    {
      latencyMs: Date.now() - upsertTimestamp,
      delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
    },
    "[UpsertQueue] Successful document upsert"
  );
  statsDClient.increment("upsert_queue_document_success.count", 1, statsDTags);
  statsDClient.distribution(
    "upsert_queue_upsert_document_success.duration.distribution",
    Date.now() - upsertTimestamp,
    []
  );
  statsDClient.distribution(
    "upsert_queue_document.duration.distribution",
    Date.now() - enqueueTimestamp,
    []
  );

  await runPostUpsertHooks({
    workspaceId: upsertQueueItem.workspaceId,
    dataSource,
    documentId: upsertQueueItem.documentId,
    section: upsertQueueItem.section,
    document: upsertRes.value.document,
    sourceUrl: upsertQueueItem.sourceUrl,
    upsertContext: upsertQueueItem.upsertContext || undefined,
  });
}

export async function upsertTableActivity(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  if (!DUST_UPSERT_QUEUE_BUCKET) {
    throw new Error("DUST_UPSERT_QUEUE_BUCKET is not set");
  }
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set");
  }

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });
  const bucket = storage.bucket(DUST_UPSERT_QUEUE_BUCKET);
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

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    upsertQueueItem.dataSourceId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "upsert_queue_activities" }
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
    tableTags: upsertQueueItem.tableTags || [],
    tableParents: upsertQueueItem.tableParents || [],
    csv: upsertQueueItem.csv,
    truncate: upsertQueueItem.truncate,
  });

  if (tableRes.isErr()) {
    logger.error(
      {
        error: tableRes.error,
        latencyMs: Date.now() - upsertTimestamp,
        delaySinceEnqueueMs: Date.now() - enqueueTimestamp,
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

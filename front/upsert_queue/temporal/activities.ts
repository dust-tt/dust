import { CoreAPI, dustManagedCredentials } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import {
  EnqueueUpsertDocument,
  runPostUpsertHooks,
} from "@app/lib/upsert_document";
import mainLogger from "@app/logger/logger";

const { DUST_UPSERT_QUEUE_BUCKET, SERVICE_ACCOUNT } = process.env;

export async function upsertDocumentActivity(upsertQueueId: string) {
  if (!DUST_UPSERT_QUEUE_BUCKET) {
    throw new Error("DUST_UPSERT_QUEUE_BUCKET is not set");
  }
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set");
  }

  let logger = mainLogger.child({ upsertQueueId });
  logger.info({}, "[UpsertQueue] Retrieving item");

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });
  const bucket = storage.bucket(DUST_UPSERT_QUEUE_BUCKET);
  const content = await bucket.file(`${upsertQueueId}.json`).download();

  const upsertDocument = JSON.parse(content.toString());

  const itemValidation = EnqueueUpsertDocument.decode(upsertDocument);
  if (isLeft(itemValidation)) {
    const pathError = reporter.formatValidationErrors(itemValidation.left);
    throw new Error(`Invalid upsertQueue item: ${pathError}`);
  }
  const upsertQueueItem = itemValidation.right;

  const auth = await Authenticator.internalBuilderForWorkspace(
    upsertQueueItem.workspaceId
  );

  const dataSource = await getDataSource(auth, upsertQueueItem.dataSourceName);

  if (!dataSource) {
    throw new Error(`Data source ${upsertQueueItem.dataSourceName} not found`);
  }

  logger = logger.child({
    workspaceId: upsertQueueItem.workspaceId,
    dataSourceName: dataSource.name,
    documentId: upsertQueueItem.documentId,
  });

  // Dust managed credentials: all data sources.
  const credentials = dustManagedCredentials();

  const coreAPI = new CoreAPI(logger);

  // Create document with the Dust internal API.
  const upsertRes = await coreAPI.upsertDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceName: dataSource.name,
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
      },
      "[UpsertQueue] Failed upsert"
    );
    throw new Error(`Upsert error: ${upsertRes.error}`);
  }

  logger.info({}, "[UpsertQueue] Successful upsert");

  await runPostUpsertHooks({
    workspaceId: upsertQueueItem.workspaceId,
    dataSource,
    documentId: upsertQueueItem.documentId,
    section: upsertQueueItem.section,
    document: upsertRes.value.document,
    sourceUrl: upsertQueueItem.sourceUrl,
    upsertContext: upsertQueueItem.upsertContext || undefined,
  });

  logger.info({}, "[UpsertQueue] Successful runPostUpsertHooks");
}

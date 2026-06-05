import config from "@app/lib/api/config";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { WorkflowError } from "@app/lib/temporal_monitoring";
import { EnqueueUpsertDocument } from "@app/lib/upsert_queue";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import mainLogger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { safeSubstring } from "@app/types/shared/utils/string_utils";
import { Storage } from "@google-cloud/storage";
import { ApplicationFailure } from "@temporalio/common";
import { fromError } from "zod-validation-error";

const { DUST_UPSERT_QUEUE_BUCKET, SERVICE_ACCOUNT } = process.env;

// Core rejects some documents with a deterministic, data-shaped error: the accumulated section
// prefixes exceed half of `max_chunk_size` and the document cannot be tokenized (see
// core/src/data_sources/splitter.rs). This is surfaced as a generic `internal_server_error` whose
// message embeds the underlying tokenization failure, so we match on the message text. Such a
// document will fail identically on every attempt, so retrying only burns worker capacity.
function isNonRetryableUpsertError(message: string): boolean {
  return message.includes("Could not tokenize the provided document");
}

function cleanUtf8Content(content: string): string {
  // Early exit if no \uD sequences found.
  if (!/[\uD800-\uDFFF]/.test(content)) {
    return content;
  }
  // Replace invalid high surrogates not followed by a low surrogate with a valid JSON string
  // Replace invalid low surrogates not preceded by a high surrogate with a valid JSON string
  return content
    .replace(/\\uD[89AB][0-9A-F]{2}(?!\\uD[CDEF][0-9A-F]{2})/gi, "\\u003F")
    .replace(/(?<!\\uD[89AB][0-9A-F]{2})\\uD[CDEF][0-9A-F]{2}/gi, "\\u003F");
}

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

  const upsertDocument = JSON.parse(cleanUtf8Content(content.toString()));

  const documentItemValidation =
    EnqueueUpsertDocument.safeParse(upsertDocument);

  if (!documentItemValidation.success) {
    throw new Error(
      `Invalid upsertQueue document: ${fromError(documentItemValidation.error).toString()}`
    );
  }

  const upsertQueueItem = documentItemValidation.data;

  const logger = mainLogger.child({
    upsertQueueId,
    workspaceId: upsertQueueItem.workspaceId,
    dataSourceId: upsertQueueItem.dataSourceId,
    documentId: upsertQueueItem.documentId,
  });

  const auth = await Authenticator.internalAdminForWorkspace(
    upsertQueueItem.workspaceId
  );

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

  const credentials = await getLlmCredentials(auth);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const upsertTimestamp = Date.now();

  // Create document with the Dust internal API.
  const upsertRes = await coreAPI.upsertDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: upsertQueueItem.documentId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    tags: ((upsertQueueItem.tags as string[] | null) || []).map((tag) =>
      safeSubstring(tag, 0)
    ),
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    parentId: upsertQueueItem.parentId || null,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    parents: upsertQueueItem.parents || [upsertQueueItem.documentId],
    sourceUrl: upsertQueueItem.sourceUrl,
    timestamp: cleanTimestamp(upsertQueueItem.timestamp),
    section: upsertQueueItem.section,
    credentials,
    lightDocumentOutput: true,
    mimeType: upsertQueueItem.mimeType,
    title: upsertQueueItem.title,
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
    getStatsDClient().increment(
      "upsert_queue_document_error.count",
      1,
      statsDTags
    );
    getStatsDClient().distribution(
      "upsert_queue_upsert_document_error.duration.distribution",
      Date.now() - upsertTimestamp,
      []
    );

    // A document that cannot be tokenized is unprocessable and will fail identically on every
    // retry, so we fail the activity permanently instead of letting Temporal retry it forever.
    if (isNonRetryableUpsertError(upsertRes.error.message)) {
      throw ApplicationFailure.nonRetryable(
        `Upsert error: ${upsertRes.error.message}`,
        "upsert_queue_upsert_document_error"
      );
    }

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
  getStatsDClient().increment(
    "upsert_queue_document_success.count",
    1,
    statsDTags
  );
  getStatsDClient().distribution(
    "upsert_queue_upsert_document_success.duration.distribution",
    Date.now() - upsertTimestamp,
    []
  );
  getStatsDClient().distribution(
    "upsert_queue_document.duration.distribution",
    Date.now() - enqueueTimestamp,
    []
  );
}

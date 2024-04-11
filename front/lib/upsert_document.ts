import type {
  CoreAPIDocument,
  CoreAPILightDocument,
  DataSourceType,
  Result,
  UpsertContext,
} from "@dust-tt/types";
import {
  Err,
  FrontDataSourceDocumentSection,
  Ok,
  sectionFullText,
  UpsertContextSchema,
} from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

import { Authenticator } from "@app/lib/auth";
import { getDocumentsPostUpsertHooksToRun } from "@app/lib/documents_post_process_hooks/hooks";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";
import { launchRunPostUpsertHooksWorkflow } from "@app/temporal/documents_post_process_hooks/client";
import { launchUpsertDocumentWorkflow } from "@app/temporal/upsert_queue/client";

const { DUST_UPSERT_QUEUE_BUCKET, SERVICE_ACCOUNT } = process.env;

export const EnqueueUpsertDocument = t.type({
  workspaceId: t.string,
  dataSourceName: t.string,
  documentId: t.string,
  tags: t.union([t.array(t.string), t.null]),
  parents: t.union([t.array(t.string), t.null]),
  sourceUrl: t.union([t.string, t.null]),
  timestamp: t.union([t.number, t.null]),
  section: FrontDataSourceDocumentSection,
  upsertContext: t.union([UpsertContextSchema, t.null]),
});

export async function enqueueUpsertDocument({
  upsertDocument,
}: {
  upsertDocument: t.TypeOf<typeof EnqueueUpsertDocument>;
}): Promise<Result<string, Error>> {
  if (!DUST_UPSERT_QUEUE_BUCKET) {
    throw new Error("DUST_UPSERT_QUEUE_BUCKET is not set");
  }
  if (!SERVICE_ACCOUNT) {
    throw new Error("SERVICE_ACCOUNT is not set");
  }

  const upsertQueueId = uuidv4();
  const now = Date.now();

  logger.info(
    {
      upsertQueueId,
      workspaceId: upsertDocument.workspaceId,
      dataSourceName: upsertDocument.dataSourceName,
      documentId: upsertDocument.documentId,
      enqueueTimestamp: now,
    },
    "[UpsertQueue] Enqueueing item"
  );

  try {
    const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });
    const bucket = storage.bucket(DUST_UPSERT_QUEUE_BUCKET);
    await bucket
      .file(`${upsertQueueId}.json`)
      .save(JSON.stringify(upsertDocument), {
        contentType: "application/json",
      });

    const launchRes = await launchUpsertDocumentWorkflow({
      workspaceId: upsertDocument.workspaceId,
      dataSourceName: upsertDocument.dataSourceName,
      upsertQueueId,
      enqueueTimestamp: now,
    });

    if (launchRes.isErr()) {
      return launchRes;
    }

    statsDClient.increment("upsert_queue.enqueue.count", 1, []);

    return new Ok(upsertQueueId);
  } catch (e) {
    if (e instanceof Error) {
      return new Err(e);
    } else {
      throw e;
    }
  }
}

export async function runPostUpsertHooks({
  workspaceId,
  dataSource,
  documentId,
  section,
  document,
  sourceUrl,
  upsertContext,
}: {
  workspaceId: string;
  dataSource: DataSourceType;
  documentId: string;
  section: t.TypeOf<typeof FrontDataSourceDocumentSection>;
  document: CoreAPILightDocument | CoreAPIDocument;
  sourceUrl: string | null;
  upsertContext?: UpsertContext;
}) {
  const fullText = sectionFullText(section);
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

  const postUpsertHooksToRun = await getDocumentsPostUpsertHooksToRun({
    auth,
    dataSourceName: dataSource.name,
    documentId: documentId,
    documentText: fullText,
    documentHash: document.hash,
    dataSourceConnectorProvider: dataSource.connectorProvider || null,
    documentSourceUrl: sourceUrl || undefined,
    upsertContext,
  });

  // TODO: parallel.
  for (const { type: hookType, debounceMs } of postUpsertHooksToRun) {
    await launchRunPostUpsertHooksWorkflow(
      dataSource.name,
      workspaceId,
      documentId,
      document.hash,
      dataSource.connectorProvider || null,
      hookType,
      debounceMs
    );
  }
}

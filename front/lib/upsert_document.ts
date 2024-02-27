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
  sectionFullText,
  UpsertContextSchema,
} from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

import { getDocumentsPostUpsertHooksToRun } from "@app/documents_post_process_hooks/hooks";
import { launchRunPostUpsertHooksWorkflow } from "@app/documents_post_process_hooks/temporal/client";
import { Authenticator } from "@app/lib/auth";
import { launchUpsertDocumentWorkflow } from "@app/upsert_queue/temporal/client";

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

  const uuid = uuidv4();
  try {
    const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });
    const bucket = storage.bucket(DUST_UPSERT_QUEUE_BUCKET);
    await bucket.file(`${uuid}.json`).save(JSON.stringify(upsertDocument), {
      contentType: "application/json",
    });

    return await launchUpsertDocumentWorkflow({
      workspaceId: upsertDocument.workspaceId,
      dataSourceName: upsertDocument.dataSourceName,
      upsertQueueId: uuid,
    });
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

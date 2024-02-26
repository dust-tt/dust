import type { Result } from "@dust-tt/types";
import { Err, FrontDataSourceDocumentSection } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

import { launchUpsertDocumentWorkflow } from "@app/upsert_queue/temporal/client";

const EnqueueUpsertDocument = t.type({
  projectId: t.string,
  workspaceId: t.string,
  dataSourceName: t.string,
  documentId: t.string,
  tags: t.union([t.array(t.string), t.null]),
  parents: t.union([t.array(t.string), t.null]),
  sourceUrl: t.union([t.string, t.null]),
  section: FrontDataSourceDocumentSection,
});

export async function enqueueUpsertDocument({
  upsertDocument,
}: {
  upsertDocument: t.TypeOf<typeof EnqueueUpsertDocument>;
}): Promise<Result<string, Error>> {
  const { DUST_UPSERT_QUEUE_BUCKET, SERVICE_ACCOUNT } = process.env;
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
    await bucket.file(uuid).save(JSON.stringify(upsertDocument));

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

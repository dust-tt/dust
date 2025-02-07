import type { Result } from "@dust-tt/types";
import {
  Err,
  FrontDataSourceDocumentSection,
  Ok,
  UpsertContextSchema,
} from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import * as t from "io-ts";
import { v4 as uuidv4 } from "uuid";

import config from "@app/lib/file_storage/config";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/withlogging";
import { launchUpsertDocumentWorkflow } from "@app/temporal/upsert_queue/client";
import { launchUpsertTableWorkflow } from "@app/temporal/upsert_tables/client";

export const EnqueueUpsertDocument = t.type({
  workspaceId: t.string,
  dataSourceId: t.string,
  documentId: t.string,
  tags: t.union([t.array(t.string), t.null]),
  parentId: t.union([t.string, t.null, t.undefined]),
  parents: t.union([t.array(t.string), t.null]),
  sourceUrl: t.union([t.string, t.null]),
  timestamp: t.union([t.number, t.null]),
  section: FrontDataSourceDocumentSection,
  upsertContext: t.union([UpsertContextSchema, t.null]),
  title: t.string,
  mimeType: t.string,
});

const DetectedHeaders = t.type({
  header: t.array(t.string),
  rowIndex: t.number,
});

export const EnqueueUpsertTable = t.type({
  workspaceId: t.string,
  dataSourceId: t.string,
  tableId: t.string,
  tableName: t.string,
  tableDescription: t.string,
  tableTimestamp: t.union([t.number, t.undefined, t.null]),
  tableTags: t.union([t.array(t.string), t.undefined, t.null]),
  tableParentId: t.union([t.string, t.undefined, t.null]),
  tableParents: t.union([t.array(t.string), t.undefined, t.null]),
  csv: t.union([t.string, t.null]),
  fileId: t.union([t.string, t.null]),
  truncate: t.boolean,
  detectedHeaders: t.union([DetectedHeaders, t.undefined]),
  title: t.string,
  mimeType: t.string,
  sourceUrl: t.union([t.string, t.undefined, t.null]),
});

type EnqueueUpsertDocumentType = t.TypeOf<typeof EnqueueUpsertDocument>;

type EnqueueUpsertTableType = t.TypeOf<typeof EnqueueUpsertTable>;

export async function enqueueUpsertDocument({
  upsertDocument,
}: {
  upsertDocument: EnqueueUpsertDocumentType;
}): Promise<Result<string, Error>> {
  const upsertQueueId = uuidv4();

  logger.info(
    {
      upsertQueueId,
      workspaceId: upsertDocument.workspaceId,
      dataSourceId: upsertDocument.dataSourceId,
      documentId: upsertDocument.documentId,
      enqueueTimestamp: Date.now(),
    },
    "[UpsertQueue] Enqueueing document"
  );

  if (
    upsertDocument.parentId &&
    upsertDocument.parents?.[1] !== upsertDocument.parentId
  ) {
    throw new Error(
      "Invalid parent id: parents[1] and parentId should be equal"
    );
  }

  return enqueueUpsert({
    upsertItem: upsertDocument,
    upsertQueueId,
    launchWorkflowFn: launchUpsertDocumentWorkflow,
  });
}

export async function enqueueUpsertTable({
  upsertTable,
}: {
  upsertTable: EnqueueUpsertTableType;
}): Promise<Result<string, Error>> {
  const upsertQueueId = uuidv4();

  logger.info(
    {
      upsertQueueId,
      workspaceId: upsertTable.workspaceId,
      dataSourceId: upsertTable.dataSourceId,
      documentId: upsertTable.tableId,
      enqueueTimestamp: Date.now(),
    },
    "[UpsertQueue] Enqueueing table"
  );

  if (
    upsertTable.tableParentId &&
    upsertTable.tableParents?.[1] !== upsertTable.tableParentId
  ) {
    throw new Error(
      "Invalid parent id: parents[1] and tableParentId should be equal"
    );
  }

  return enqueueUpsert({
    upsertItem: upsertTable,
    upsertQueueId,
    launchWorkflowFn: launchUpsertTableWorkflow,
  });
}

async function enqueueUpsert({
  upsertItem,
  upsertQueueId,
  launchWorkflowFn,
}:
  | {
      upsertItem: EnqueueUpsertDocumentType;
      upsertQueueId: string;
      launchWorkflowFn: typeof launchUpsertDocumentWorkflow;
    }
  | {
      upsertItem: EnqueueUpsertTableType;
      upsertQueueId: string;
      launchWorkflowFn: typeof launchUpsertTableWorkflow;
    }): Promise<Result<string, Error>> {
  const now = Date.now();

  try {
    const storage = new Storage({ keyFilename: config.getServiceAccount() });
    const bucket = storage.bucket(config.getGcsUpsertQueueBucket());
    await bucket
      .file(`${upsertQueueId}.json`)
      .save(JSON.stringify(upsertItem), {
        contentType: "application/json",
      });

    const launchRes = await launchWorkflowFn({
      workspaceId: upsertItem.workspaceId,
      dataSourceId: upsertItem.dataSourceId,
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

import { getUpsertQueueBucket } from "@app/lib/file_storage";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

import { launchUpsertDocumentWorkflow } from "@app/temporal/upsert_queue/client";
import { launchUpsertTableWorkflow } from "@app/temporal/upsert_tables/client";
import {
  FrontDataSourceDocumentSection,
  UpsertContextSchema,
} from "@app/types/api/public/data_sources";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export const EnqueueUpsertDocument = z.object({
  workspaceId: z.string(),
  dataSourceId: z.string(),
  documentId: z.string(),
  tags: z.array(z.string()).nullable(),
  parentId: z.string().nullish(),
  parents: z.array(z.string()).nullable(),
  sourceUrl: z.string().nullable(),
  timestamp: z.number().nullable(),
  section: FrontDataSourceDocumentSection,
  upsertContext: UpsertContextSchema.nullable(),
  title: z.string(),
  mimeType: z.string(),
});

export const EnqueueUpsertTable = z.object({
  workspaceId: z.string(),
  dataSourceId: z.string(),
  tableId: z.string(),
  tableName: z.string(),
  tableDescription: z.string(),
  tableTimestamp: z.number().nullish(),
  tableTags: z.array(z.string()).nullish(),
  tableParentId: z.string().nullish(),
  tableParents: z.array(z.string()).nullish(),
  csv: z.string().nullable(),
  fileId: z.string().nullable(),
  truncate: z.boolean(),
  title: z.string(),
  mimeType: z.string(),
  sourceUrl: z.string().nullish(),
});

type EnqueueUpsertDocumentType = z.infer<typeof EnqueueUpsertDocument>;

type EnqueueUpsertTableType = z.infer<typeof EnqueueUpsertTable>;

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
  try {
    const now = Date.now();
    await getUpsertQueueBucket()
      .file(`${upsertQueueId}.json`)
      .save(JSON.stringify(upsertItem), {
        contentType: "application/json",
      });
    const latencyGcsMs = Date.now() - now;
    const launchRes = await launchWorkflowFn({
      workspaceId: upsertItem.workspaceId,
      dataSourceId: upsertItem.dataSourceId,
      upsertQueueId,
      enqueueTimestamp: now,
    });
    const latencyTemporalMs = Date.now() - now - latencyGcsMs;

    logger.info(
      {
        upsertQueueId,
        workspaceId: upsertItem.workspaceId,
        dataSourceId: upsertItem.dataSourceId,
        latencyGcsMs,
        latencyTemporalMs,
      },
      "[UpsertQueue] Enqueued item"
    );
    if (launchRes.isErr()) {
      return launchRes;
    }

    getStatsDClient().increment("upsert_queue.enqueue.count", 1, []);

    return new Ok(upsertQueueId);
  } catch (e) {
    if (e instanceof Error) {
      return new Err(e);
    } else {
      throw e;
    }
  }
}

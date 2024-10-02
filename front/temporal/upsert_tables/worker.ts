import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/upsert_queue/activities";

import { QUEUE_NAME } from "./config";

export async function runUpsertTableQueueWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
    // At the time of edit we have 1 upsert-table-worker. We target 10 overall concurrency.
    // TODO(2024-10-02 flav) Revisit once we have better understanding of the load.
    maxConcurrentActivityTaskExecutions: 10,
    connection,
    namespace,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
  });

  await worker.run();
}

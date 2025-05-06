import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/labs/transcripts/activities";

import { TRANSCRIPTS_QUEUE_NAME } from "./config";

export async function runLabsTranscriptsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: TRANSCRIPTS_QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 16,
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

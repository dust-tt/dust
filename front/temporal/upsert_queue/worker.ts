import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/upsert_queue/activities";
import * as audioTranscriptActivities from "@app/temporal/upsert_queue/audio_transcript_activities";

import { QUEUE_NAME } from "./config";

export async function runUpsertQueueWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      ...activities,
      ...audioTranscriptActivities,
    },
    taskQueue: QUEUE_NAME,
    // At the time of edit we have 2 front-worker. We target 64 overall concurrency.
    maxConcurrentActivityTaskExecutions: 32,
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

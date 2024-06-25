import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/hard_delete/activities";
import { launchPurgeRunExecutionsSchedule } from "@app/temporal/hard_delete/client";

import { QUEUE_NAME } from "./config";

export async function runHardDeleteWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
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

  // Start the schedule.
  await launchPurgeRunExecutionsSchedule();

  await worker.run();
}

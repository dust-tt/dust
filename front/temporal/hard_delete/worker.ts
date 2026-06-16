import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/hard_delete/activities";
import { launchHardDeleteSchedule } from "@app/temporal/hard_delete/client";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

export async function runHardDeleteWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "hard_delete",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 32,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
  });

  // Start the schedule.
  await launchHardDeleteSchedule();

  await worker.run();
}

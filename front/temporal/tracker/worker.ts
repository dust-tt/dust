import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/tracker/activities";
import {
  RUN_QUEUE_NAME,
  TRACKER_NOTIFICATION_QUEUE_NAME,
} from "@app/temporal/tracker/config";

export async function runTrackerWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "document_tracker",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: RUN_QUEUE_NAME,
    connection,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
      ],
    },
    maxConcurrentActivityTaskExecutions: 8,
  });

  await worker.run();
}

export async function runTrackerNotificationWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "tracker_notification",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: TRACKER_NOTIFICATION_QUEUE_NAME,
    connection,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
      ],
    },
  });

  await worker.run();
}

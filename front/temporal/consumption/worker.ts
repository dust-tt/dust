import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/consumption/activities";
import { QUEUE_NAME } from "@app/temporal/consumption/config";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = 32;

export async function runConsumptionWorker(): Promise<void> {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "consumption",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions:
      MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
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

import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalAgentWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";

import * as activities from "./activities";
import { QUEUE_NAME } from "./config";

export async function runAgentTriggerWorker() {
  const { connection, namespace } = await getTemporalAgentWorkerConnection();

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 2,
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

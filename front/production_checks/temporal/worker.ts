import { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as activities from "@app/production_checks/temporal/activities";

import { QUEUE_NAME } from "./config";

export async function runProductionChecksWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
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

import { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/notion/temporal/activities";
import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runNotionWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 3,
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

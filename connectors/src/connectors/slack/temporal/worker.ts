import { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/slack/temporal/activities";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runSlackWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "slack-queue",
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

  const workerPromise = worker.run();
  const statusReportInterval = setInterval(() => {
    const status = worker.getStatus();

    logger.info(
      {
        ...status,
      },
      "Worker status report"
    );
  }, 30000);
  await workerPromise.finally(() => clearInterval(statusReportInterval));
}

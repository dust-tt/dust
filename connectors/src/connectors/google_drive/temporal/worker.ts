import { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/google_drive/temporal/activities";
import * as sync_status from "@connectors/lib/sync_status";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runGoogleWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...activities, ...sync_status },
    taskQueue: "google-queue",
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

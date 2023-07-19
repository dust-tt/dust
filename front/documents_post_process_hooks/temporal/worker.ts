import { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@app/documents_post_process_hooks/temporal/activities";
import { getTemporalWorkerConnection } from "@app/documents_post_process_hooks/temporal/lib";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";

export async function runPostUpsertHooksWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "post-upsert-hooks-queue",
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

import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

import { QUEUE_NAME } from "./config";

export async function runAgentLoopWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      runModelActivity,
      runToolActivity,
    },
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

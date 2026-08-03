import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/labs/transcripts/activities";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { TRANSCRIPTS_QUEUE_NAME } from "./config";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

export async function runLabsTranscriptsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "labs",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: TRANSCRIPTS_QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 16,
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

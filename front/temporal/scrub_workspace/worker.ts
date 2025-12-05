import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/scrub_workspace/activities";

import { QUEUE_NAME } from "./config";

export async function runScrubWorkspaceQueueWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "scrub_workspace_queue",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    maxConcurrentActivityTaskExecutions: 2,
    taskQueue: QUEUE_NAME,
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

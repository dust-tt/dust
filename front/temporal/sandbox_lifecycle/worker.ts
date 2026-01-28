import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/sandbox_lifecycle/activities";
import { QUEUE_NAME } from "@app/temporal/sandbox_lifecycle/config";

export async function runSandboxLifecycleWorker(): Promise<void> {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "sandbox_lifecycle",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 4,
    connection,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(ctx, logger),
        }),
      ],
    },
  });

  await worker.run();
}
